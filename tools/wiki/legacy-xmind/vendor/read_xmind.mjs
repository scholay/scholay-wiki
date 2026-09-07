#!/usr/bin/env node

// XMind file reader - reads JSON from stdin, outputs parsed data to stdout
// Usage: echo '{"action":"read","path":"/tmp/file.xmind"}' | node read_xmind.mjs
// No external dependencies — uses only Node.js built-ins.

import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, basename, normalize } from 'path';
import { inflateRawSync } from 'zlib';

// ─── Minimal ZIP reader (PKZIP APPNOTE 6.3.3) ───

function readZip(buf) {
    // Find End of Central Directory record (scan backwards)
    let eocdOffset = -1;
    for (let i = buf.length - 22; i >= 0; i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) {
            eocdOffset = i;
            break;
        }
    }
    if (eocdOffset === -1) throw new Error('Invalid ZIP: EOCD not found');

    const cdEntries = buf.readUInt16LE(eocdOffset + 10);
    const cdSize = buf.readUInt32LE(eocdOffset + 12);
    const cdOffset = buf.readUInt32LE(eocdOffset + 16);

    // Read Central Directory entries
    const files = new Map();
    let pos = cdOffset;
    for (let i = 0; i < cdEntries; i++) {
        if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error('Invalid ZIP: bad CD entry');
        const compression = buf.readUInt16LE(pos + 10);
        const compressedSize = buf.readUInt32LE(pos + 20);
        const uncompressedSize = buf.readUInt32LE(pos + 24);
        const nameLen = buf.readUInt16LE(pos + 28);
        const extraLen = buf.readUInt16LE(pos + 30);
        const commentLen = buf.readUInt16LE(pos + 32);
        const localHeaderOffset = buf.readUInt32LE(pos + 42);
        const name = buf.toString('utf-8', pos + 46, pos + 46 + nameLen);

        files.set(name, { compression, compressedSize, uncompressedSize, localHeaderOffset });
        pos += 46 + nameLen + extraLen + commentLen;
    }

    return {
        extract(name) {
            const entry = files.get(name);
            if (!entry) return null;

            // Read Local File Header to get actual data offset
            const lhOffset = entry.localHeaderOffset;
            if (buf.readUInt32LE(lhOffset) !== 0x04034b50) throw new Error('Invalid ZIP: bad local header');
            const lhNameLen = buf.readUInt16LE(lhOffset + 26);
            const lhExtraLen = buf.readUInt16LE(lhOffset + 28);
            const dataOffset = lhOffset + 30 + lhNameLen + lhExtraLen;
            const rawData = buf.subarray(dataOffset, dataOffset + entry.compressedSize);

            if (entry.compression === 0) return rawData;
            if (entry.compression === 8) return inflateRawSync(rawData);
            throw new Error(`Unsupported compression method: ${entry.compression}`);
        },
        names() { return [...files.keys()]; },
    };
}

// ─── Minimal XML parser (for XMind 8 legacy content.xml) ───

function parseXml(xml) {
    // Returns a tree of {tag, attrs, children, text}
    let pos = 0;

    // Strip all processing instructions (<?...?>) and DOCTYPE declarations
    xml = xml.replace(/<\?[^?]*\?>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '').trim();

    function skipWhitespace() {
        while (pos < xml.length && /\s/.test(xml[pos])) pos++;
    }

    function parseAttrs() {
        const attrs = {};
        while (pos < xml.length) {
            skipWhitespace();
            if (xml[pos] === '/' || xml[pos] === '>') break;
            // Read attribute name
            let name = '';
            while (pos < xml.length && xml[pos] !== '=' && xml[pos] !== '/' && xml[pos] !== '>' && !/\s/.test(xml[pos])) {
                name += xml[pos++];
            }
            if (!name) break;
            skipWhitespace();
            if (xml[pos] === '=') {
                pos++; // skip =
                skipWhitespace();
                const quote = xml[pos++]; // " or '
                let val = '';
                while (pos < xml.length && xml[pos] !== quote) {
                    if (xml[pos] === '&') {
                        // Basic entity decode
                        const semi = xml.indexOf(';', pos);
                        if (semi !== -1) {
                            const entity = xml.substring(pos + 1, semi);
                            if (entity === 'amp') val += '&';
                            else if (entity === 'lt') val += '<';
                            else if (entity === 'gt') val += '>';
                            else if (entity === 'quot') val += '"';
                            else if (entity === 'apos') val += "'";
                            else if (entity.startsWith('#x')) val += String.fromCharCode(parseInt(entity.slice(2), 16));
                            else if (entity.startsWith('#')) val += String.fromCharCode(parseInt(entity.slice(1), 10));
                            else val += `&${entity};`;
                            pos = semi + 1;
                        } else {
                            val += xml[pos++];
                        }
                    } else {
                        val += xml[pos++];
                    }
                }
                pos++; // skip closing quote
                attrs[name] = val;
            } else {
                attrs[name] = name; // boolean attribute
            }
        }
        return attrs;
    }

    function parseElement() {
        skipWhitespace();
        if (pos >= xml.length || xml[pos] !== '<') return null;

        // Skip comments
        if (xml.startsWith('<!--', pos)) {
            pos = xml.indexOf('-->', pos) + 3;
            return parseElement();
        }

        pos++; // skip <
        // Read tag name
        let tag = '';
        while (pos < xml.length && xml[pos] !== '/' && xml[pos] !== '>' && !/\s/.test(xml[pos])) {
            tag += xml[pos++];
        }

        const attrs = parseAttrs();
        skipWhitespace();

        // Self-closing
        if (xml[pos] === '/') {
            pos += 2; // skip />
            return { tag, attrs, children: [], text: '' };
        }
        pos++; // skip >

        // Parse children and text content
        // `parts` preserves interleaving order of text and child elements (for mixed content like HTML)
        const children = [];
        const parts = [];
        let text = '';

        while (pos < xml.length) {
            if (xml.startsWith('<![CDATA[', pos)) {
                // CDATA section
                const cdataEnd = xml.indexOf(']]>', pos + 9);
                if (cdataEnd !== -1) {
                    const cd = xml.substring(pos + 9, cdataEnd);
                    text += cd;
                    parts.push({ type: 'text', value: cd });
                    pos = cdataEnd + 3;
                } else {
                    const cd = xml.substring(pos + 9);
                    text += cd;
                    parts.push({ type: 'text', value: cd });
                    pos = xml.length;
                }
            } else if (xml[pos] === '<') {
                if (xml[pos + 1] === '/') {
                    // Closing tag
                    const end = xml.indexOf('>', pos);
                    pos = end + 1;
                    break;
                }
                if (xml.startsWith('<!--', pos)) {
                    pos = xml.indexOf('-->', pos) + 3;
                    continue;
                }
                const child = parseElement();
                if (child) {
                    children.push(child);
                    parts.push({ type: 'element', value: child });
                }
            } else {
                // Text content
                let t = '';
                while (pos < xml.length && xml[pos] !== '<') {
                    t += xml[pos++];
                }
                // Decode entities in text
                t = t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
                text += t;
                parts.push({ type: 'text', value: t });
            }
        }

        return { tag, attrs, children, text: text.trim(), parts };
    }

    return parseElement();
}

// Helper: find child element(s) by tag name (ignoring namespace prefix)
function xmlFind(el, tagName) {
    if (!el || !el.children) return [];
    return el.children.filter(c => {
        const localTag = c.tag.includes(':') ? c.tag.split(':').pop() : c.tag;
        return localTag === tagName;
    });
}

function xmlFindOne(el, tagName) {
    return xmlFind(el, tagName)[0] || null;
}

function xmlText(el, tagName) {
    const child = xmlFindOne(el, tagName);
    return child ? child.text : '';
}

function xmlAttr(el, name) {
    if (!el || !el.attrs) return '';
    // Try exact match first, then try with common prefixes
    if (el.attrs[name] !== undefined) return el.attrs[name];
    // Try with namespace prefixes
    for (const [k, v] of Object.entries(el.attrs)) {
        const localName = k.includes(':') ? k.split(':').pop() : k;
        if (localName === name) return v;
    }
    return '';
}

// Reconstruct HTML from XMind 8 xhtml:* elements, preserving mixed content order via `parts`
function reconstructHtml(el) {
    let html = '';
    const items = el.parts || [];
    // If no parts (shouldn't happen), fall back to children
    if (items.length === 0 && el.children?.length > 0) {
        for (const child of el.children) items.push({ type: 'element', value: child });
    }
    for (const part of items) {
        if (part.type === 'text') {
            html += part.value;
        } else if (part.type === 'element') {
            const child = part.value;
            const localTag = child.tag.includes(':') ? child.tag.split(':').pop() : child.tag;
            if (['p', 'span', 'strong', 'em', 'u', 'br', 'ul', 'ol', 'li', 'a', 'img', 'b', 'i', 'sub', 'sup', 'del', 's'].includes(localTag)) {
                const styleAttr = child.attrs?.style ? ` style="${child.attrs.style}"` : '';
                const hrefAttr = child.attrs?.['xlink:href'] || child.attrs?.href;
                const hrefStr = hrefAttr ? ` href="${hrefAttr}"` : '';
                if (localTag === 'br' || localTag === 'img') {
                    html += `<${localTag}${styleAttr}/>`;
                } else {
                    html += `<${localTag}${styleAttr}${hrefStr}>`;
                    html += reconstructHtml(child);
                    html += `</${localTag}>`;
                }
            } else {
                // Unknown tag — include content only
                html += reconstructHtml(child);
            }
        }
    }
    return html;
}

// ─── XMind 8 XML format parser ───

// Known <topic> attributes mapped to result field names
const TOPIC_ATTR_MAP = {
    'id':              'id',
    'structure-class': 'structureClass',
    'xlink:href':      'href',
    'style-id':        'styleId',
    'branch':          'branch',
    'timestamp':       'timestamp',
};

function processXmlTopic(topicEl, sheetTitle) {
    const result = {
        title: xmlText(topicEl, 'title') || '',
        id: xmlAttr(topicEl, 'id'),
        sheetTitle: sheetTitle || 'Untitled Map',
    };

    // ── Capture ALL <topic> attributes ──
    // Map known attrs to canonical field names; pass through unknown ones verbatim.
    if (topicEl.attrs) {
        for (const [key, val] of Object.entries(topicEl.attrs)) {
            if (!val) continue;
            const mapped = TOPIC_ATTR_MAP[key];
            if (mapped) {
                if (mapped !== 'id') result[mapped] = val; // id already set
            } else {
                // Skip xmlns declarations
                if (key.startsWith('xmlns')) continue;
                // Store unknown attribute directly (camelCase the key)
                const camel = key.replace(/[-:]([a-z])/g, (_, c) => c.toUpperCase());
                result[camel] = val;
            }
        }
    }

    // ── Position ──
    const posEl = xmlFindOne(topicEl, 'position');
    if (posEl) {
        const x = parseInt(xmlAttr(posEl, 'x') || xmlAttr(posEl, 'svg:x'), 10);
        const y = parseInt(xmlAttr(posEl, 'y') || xmlAttr(posEl, 'svg:y'), 10);
        if (!isNaN(x) && !isNaN(y)) result.position = { x, y };
    }

    // ── Labels ──
    const labelsEl = xmlFindOne(topicEl, 'labels');
    if (labelsEl) {
        const labels = xmlFind(labelsEl, 'label').map(l => l.text).filter(Boolean);
        if (labels.length > 0) result.labels = labels;
    }

    // ── Notes ──
    const notesEl = xmlFindOne(topicEl, 'notes');
    if (notesEl) {
        const plainEl = xmlFindOne(notesEl, 'plain');
        // XMind 8 uses <xhtml:html> or just <html> for rich notes
        const htmlEl = xmlFindOne(notesEl, 'html') ||
            notesEl.children?.find(c => c.tag === 'xhtml:html');
        if (plainEl || htmlEl) {
            result.notes = {};
            if (plainEl) {
                const contentEl = xmlFindOne(plainEl, 'content');
                result.notes.content = contentEl ? contentEl.text : plainEl.text;
            }
            if (htmlEl) {
                if (htmlEl.text) {
                    result.notes.html = htmlEl.text;
                } else if (htmlEl.children?.length > 0) {
                    result.notes.html = reconstructHtml(htmlEl);
                }
            }
        }
    }

    // ── Markers ──
    const markerRefsEl = xmlFindOne(topicEl, 'marker-refs');
    if (markerRefsEl) {
        const markers = xmlFind(markerRefsEl, 'marker-ref')
            .map(m => m.attrs?.['marker-id'] || xmlAttr(m, 'marker-id'))
            .filter(Boolean);
        if (markers.length > 0) result.markers = markers;
    }

    // ── Image ──
    const imageEl = xmlFindOne(topicEl, 'xhtml:img') || xmlFindOne(topicEl, 'img');
    if (imageEl) {
        const src = imageEl.attrs?.['xhtml:src'] || imageEl.attrs?.src ||
                    xmlAttr(imageEl, 'src') || xmlAttr(imageEl, 'xhtml:src');
        if (src) result.image = { src };
        const w = imageEl.attrs?.['svg:width'] || xmlAttr(imageEl, 'width');
        const h = imageEl.attrs?.['svg:height'] || xmlAttr(imageEl, 'height');
        if (w && result.image) result.image.width = w;
        if (h && result.image) result.image.height = h;
    }

    // ── Numbering ──
    const numberingEl = xmlFindOne(topicEl, 'numbering');
    if (numberingEl) {
        result.numbering = { ...numberingEl.attrs };
        const prefix = xmlText(numberingEl, 'prefix');
        const suffix = xmlText(numberingEl, 'suffix');
        if (prefix) result.numbering.prefix = prefix;
        if (suffix) result.numbering.suffix = suffix;
    }

    // ── Children element ──
    const childrenEl = xmlFindOne(topicEl, 'children');

    // ── Callouts ──
    if (childrenEl) {
        const calloutTopics = xmlFind(childrenEl, 'topics').filter(t => t.attrs?.type === 'callout');
        if (calloutTopics.length > 0) {
            const callouts = [];
            for (const ct of calloutTopics) {
                for (const t of xmlFind(ct, 'topic')) {
                    const title = xmlText(t, 'title');
                    if (title) callouts.push({ title });
                }
            }
            if (callouts.length > 0) result.callouts = callouts;
        }
    }

    // ── Boundaries ──
    const boundariesEl = xmlFindOne(topicEl, 'boundaries');
    if (boundariesEl) {
        const boundaries = xmlFind(boundariesEl, 'boundary').map(b => {
            const entry = { id: xmlAttr(b, 'id'), range: xmlAttr(b, 'range') };
            const title = xmlText(b, 'title');
            if (title) entry.title = title;
            return entry;
        }).filter(b => b.range);
        if (boundaries.length > 0) result.boundaries = boundaries;
    }

    // ── Summaries ──
    const summariesEl = xmlFindOne(topicEl, 'summaries');
    if (summariesEl) {
        const summaryTopicTitles = new Map();
        if (childrenEl) {
            const summaryTopicsContainers = xmlFind(childrenEl, 'topics').filter(t => t.attrs?.type === 'summary');
            for (const stc of summaryTopicsContainers) {
                for (const st of xmlFind(stc, 'topic')) {
                    const stId = xmlAttr(st, 'id');
                    const stTitle = xmlText(st, 'title');
                    if (stId && stTitle) summaryTopicTitles.set(stId, stTitle);
                }
            }
        }
        const summaries = xmlFind(summariesEl, 'summary').map(s => {
            const entry = {
                id: xmlAttr(s, 'id'),
                range: xmlAttr(s, 'range'),
                topicId: xmlAttr(s, 'topic-id'),
            };
            const topicTitle = summaryTopicTitles.get(entry.topicId);
            if (topicTitle) entry.topicTitle = topicTitle;
            return entry;
        }).filter(s => s.range);
        if (summaries.length > 0) result.summaries = summaries;
    }

    // ── Extensions (task info + all others) ──
    const extensionsEl = xmlFindOne(topicEl, 'extensions');
    if (extensionsEl) {
        const rawExtensions = [];
        for (const extEl of xmlFind(extensionsEl, 'extension')) {
            const provider = xmlAttr(extEl, 'provider');
            const contentEl = xmlFindOne(extEl, 'content');

            if ((provider === 'org.xmind.ui.taskInfo' || provider === 'org.xmind.ui.task') && contentEl) {
                // Parse task fields
                const status = xmlAttr(contentEl, 'status') || xmlText(contentEl, 'status');
                const progress = xmlAttr(contentEl, 'progress') || xmlText(contentEl, 'progress');
                const priority = xmlAttr(contentEl, 'priority') || xmlText(contentEl, 'priority');
                const start = xmlAttr(contentEl, 'start') || xmlText(contentEl, 'start');
                const due = xmlAttr(contentEl, 'due') || xmlText(contentEl, 'due');
                const duration = xmlAttr(contentEl, 'duration') || xmlText(contentEl, 'duration');

                if (status) result.taskStatus = status;
                if (progress) result.progress = parseFloat(progress);
                if (priority) result.priority = parseInt(priority, 10);
                if (start) result.startDate = new Date(parseInt(start, 10)).toISOString();
                if (due) result.dueDate = new Date(parseInt(due, 10)).toISOString();
                if (duration) result.duration = parseInt(duration, 10);

                const depsEl = xmlFindOne(contentEl, 'dependencies');
                if (depsEl) {
                    const deps = xmlFind(depsEl, 'dependency').map(d => ({
                        id: xmlAttr(d, 'id'),
                        type: xmlAttr(d, 'type'),
                        lag: parseInt(xmlAttr(d, 'lag') || '0', 10),
                    })).filter(d => d.id);
                    if (deps.length > 0) result.dependencies = deps;
                }
            } else {
                // Preserve unknown extensions as-is
                const ext = { provider };
                if (contentEl) {
                    ext.content = {};
                    // Capture all attributes on <content>
                    if (contentEl.attrs) Object.assign(ext.content, contentEl.attrs);
                    // Capture all child element text values
                    for (const child of contentEl.children || []) {
                        const localTag = child.tag.includes(':') ? child.tag.split(':').pop() : child.tag;
                        ext.content[localTag] = child.text || serializeXmlElement(child);
                    }
                    if (contentEl.text) ext.content._text = contentEl.text;
                }
                rawExtensions.push(ext);
            }
        }
        if (rawExtensions.length > 0) result.extensions = rawExtensions;
    }

    // ── Style → shape (inline style or style-id reference) ──
    const styleEl = xmlFindOne(topicEl, 'style');
    if (styleEl) {
        const propsEl = xmlFindOne(styleEl, 'topic-properties') || xmlFindOne(styleEl, 'properties');
        if (propsEl) {
            const shape = xmlAttr(propsEl, 'shape-class') || propsEl.attrs?.['fo:shape-class'];
            if (shape) result.shape = shape;
            // Capture all style properties
            if (propsEl.attrs && Object.keys(propsEl.attrs).length > 0) {
                if (!result.styleProperties) result.styleProperties = {};
                Object.assign(result.styleProperties, propsEl.attrs);
            }
        }
    }
    // shape-class directly on <topic>
    const directShapeClass = topicEl.attrs?.['shape-class'];
    if (directShapeClass) result.shape = directShapeClass;

    // ── Children (attached) ──
    // type="attached" is standard, but older XMind editors may omit the type attribute entirely
    if (childrenEl) {
        const attachedTopics = xmlFind(childrenEl, 'topics').filter(t => {
            const type = t.attrs?.type;
            return type === 'attached' || (!type && type !== 'detached' && type !== 'callout' && type !== 'summary');
        });
        if (attachedTopics.length > 0) {
            const children = [];
            for (const at of attachedTopics) {
                for (const t of xmlFind(at, 'topic')) {
                    children.push(processXmlTopic(t, sheetTitle));
                }
            }
            if (children.length > 0) result.children = children;
        }
    }

    return result;
}

// Serialize an XML element back to string (for unknown/opaque content preservation)
function serializeXmlElement(el) {
    if (!el) return '';
    let s = `<${el.tag}`;
    for (const [k, v] of Object.entries(el.attrs || {})) s += ` ${k}="${v}"`;
    if (!el.children?.length && !el.text) return s + '/>';
    s += '>';
    if (el.text) s += el.text;
    for (const child of el.children || []) s += serializeXmlElement(child);
    s += `</${el.tag}>`;
    return s;
}

// Parse styles.xml into a map of style-id → {properties}
function parseStylesXml(zip) {
    const stylesMap = new Map();
    const stylesRaw = zip.extract('styles.xml');
    if (!stylesRaw) return stylesMap;
    try {
        const root = parseXml(stylesRaw.toString('utf-8'));
        if (!root) return stylesMap;
        // Collect from <styles>, <automatic-styles>, <master-styles>
        for (const container of root.children || []) {
            for (const styleEl of xmlFind(container, 'style')) {
                const id = xmlAttr(styleEl, 'id');
                if (!id) continue;
                const props = {};
                // Gather properties from all child property elements
                for (const child of styleEl.children || []) {
                    const localTag = child.tag.includes(':') ? child.tag.split(':').pop() : child.tag;
                    if (localTag.endsWith('-properties') || localTag === 'properties') {
                        if (child.attrs) Object.assign(props, child.attrs);
                    }
                }
                stylesMap.set(id, props);
            }
        }
    } catch { /* ignore style parse errors */ }
    return stylesMap;
}

// Resolve style-id on a topic result using the styles map
function resolveTopicStyle(result, stylesMap) {
    if (result.styleId && stylesMap.has(result.styleId)) {
        const props = stylesMap.get(result.styleId);
        if (props['shape-class'] && !result.shape) result.shape = props['shape-class'];
        if (!result.styleProperties) result.styleProperties = {};
        Object.assign(result.styleProperties, props);
    }
    // Recurse into children
    if (result.children) {
        for (const child of result.children) resolveTopicStyle(child, stylesMap);
    }
    if (result.detachedTopics) {
        for (const dt of result.detachedTopics) resolveTopicStyle(dt, stylesMap);
    }
}

function parseXMindLegacy(filePath) {
    const buf = readFileSync(resolve(filePath));
    const zip = readZip(buf);
    const contentRaw = zip.extract('content.xml');
    if (!contentRaw) throw new Error('content.xml not found in XMind file');
    const xmlStr = contentRaw.toString('utf-8');
    const root = parseXml(xmlStr);
    // Accept root tag with or without namespace prefix (e.g. <ns:xmap-content>)
    const rootLocalTag = root?.tag?.includes(':') ? root.tag.split(':').pop() : root?.tag;
    if (!root || rootLocalTag !== 'xmap-content') {
        throw new Error('Invalid XMind 8 file: expected <xmap-content> root element');
    }

    // Parse styles.xml for shape/font/color resolution
    const stylesMap = parseStylesXml(zip);

    return xmlFind(root, 'sheet').map(sheetEl => {
        const sheetTitle = xmlText(sheetEl, 'title') || 'Untitled Map';
        const topicEl = xmlFindOne(sheetEl, 'topic');
        if (!topicEl) throw new Error('Sheet has no root topic');

        const rootNode = processXmlTopic(topicEl, sheetTitle);

        // Detached topics
        const childrenEl = xmlFindOne(topicEl, 'children');
        if (childrenEl) {
            const detachedTopics = xmlFind(childrenEl, 'topics').filter(t => t.attrs?.type === 'detached');
            if (detachedTopics.length > 0) {
                const detached = [];
                for (const dt of detachedTopics) {
                    for (const t of xmlFind(dt, 'topic')) {
                        detached.push(processXmlTopic(t, sheetTitle));
                    }
                }
                if (detached.length > 0) rootNode.detachedTopics = detached;
            }
        }

        // Relationships
        const relsEl = xmlFindOne(sheetEl, 'relationships');
        if (relsEl) {
            const relationships = xmlFind(relsEl, 'relationship').map(relEl => {
                const r = {
                    id: xmlAttr(relEl, 'id'),
                    end1Id: xmlAttr(relEl, 'end1'),
                    end2Id: xmlAttr(relEl, 'end2'),
                };
                const title = xmlText(relEl, 'title');
                if (title) r.title = title;
                // Relationship style/shape
                const styleEl = xmlFindOne(relEl, 'style');
                if (styleEl) {
                    const propsEl = xmlFindOne(styleEl, 'relationship-properties') || xmlFindOne(styleEl, 'properties');
                    if (propsEl) {
                        const shape = xmlAttr(propsEl, 'shape-class');
                        if (shape) r.shape = shape;
                    }
                }
                // Control points
                const cpEl = xmlFindOne(relEl, 'control-points');
                if (cpEl) {
                    const points = xmlFind(cpEl, 'control-point').map(cp => {
                        const pt = {};
                        const idx = xmlAttr(cp, 'index'); if (idx) pt.index = parseInt(idx, 10);
                        const amt = xmlAttr(cp, 'amount'); if (amt) pt.amount = parseFloat(amt);
                        const ang = xmlAttr(cp, 'angle'); if (ang) pt.angle = parseFloat(ang);
                        return pt;
                    });
                    if (points.length > 0) r.controlPoints = points;
                }
                return r;
            }).filter(r => r.end1Id && r.end2Id);
            if (relationships.length > 0) rootNode.relationships = relationships;
        }

        // Resolve style-id → shape/properties from styles.xml
        if (stylesMap.size > 0) resolveTopicStyle(rootNode, stylesMap);

        return rootNode;
    });
}

// ─── Format detection ───

function detectFormat(filePath) {
    const buf = readFileSync(resolve(filePath));
    const zip = readZip(buf);
    const names = zip.names();
    if (names.includes('content.json')) return 'zen';
    if (names.includes('content.xml')) return 'legacy';
    throw new Error('Unknown XMind format: neither content.json nor content.xml found');
}

// ─── XMind Parser (new JSON format) ───

function processNode(node, sheetTitle) {
    const result = {
        title: node.title,
        id: node.id,
        sheetTitle: sheetTitle || 'Untitled Map',
    };

    if (node.structureClass) result.structureClass = node.structureClass;
    if (node.style?.properties?.['shape-class']) result.shape = node.style.properties['shape-class'];
    if (node.position) result.position = node.position;
    if (node.href) result.href = node.href;
    if (node.labels) result.labels = node.labels;

    if (node.children?.callout) {
        result.callouts = node.children.callout.map(c => ({ title: c.title }));
    }

    if (node.notes?.plain?.content || node.notes?.realHTML?.content) {
        result.notes = {};
        if (node.notes?.plain?.content) result.notes.content = node.notes.plain.content;
        if (node.notes?.realHTML?.content) result.notes.html = node.notes.realHTML.content;
    }

    if (node.markers?.length > 0) {
        result.markers = node.markers.map(m => m.markerId);
    }

    if (node.boundaries?.length > 0) {
        result.boundaries = node.boundaries;
    }

    if (node.summaries?.length > 0) {
        result.summaries = node.summaries.map(s => {
            const entry = { id: s.id, range: s.range, topicId: s.topicId };
            if (node.summary) {
                const st = node.summary.find(t => t.id === s.topicId);
                if (st) entry.topicTitle = st.title;
            }
            return entry;
        });
    }

    if (node.extensions) {
        const taskExt = node.extensions.find(e => e.provider === 'org.xmind.ui.task');
        if (taskExt) {
            const c = taskExt.content;
            if (c.status) result.taskStatus = c.status;
            if (c.progress !== undefined) result.progress = c.progress;
            if (c.priority !== undefined) result.priority = c.priority;
            if (c.duration !== undefined) result.duration = c.duration;
            if (c.start !== undefined) result.startDate = new Date(c.start).toISOString();
            if (c.due !== undefined) result.dueDate = new Date(c.due).toISOString();
            if (c.dependencies?.length > 0) result.dependencies = c.dependencies;
        }
    }

    if (node.children?.attached) {
        result.children = node.children.attached.map(child => processNode(child, sheetTitle));
    }

    return result;
}

function parseXMindZen(filePath) {
    const buf = readFileSync(resolve(filePath));
    const zip = readZip(buf);
    const contentRaw = zip.extract('content.json');
    if (!contentRaw) return [];
    // Strip UTF-8 BOM if present
    let jsonStr = contentRaw.toString('utf-8');
    if (jsonStr.charCodeAt(0) === 0xFEFF) jsonStr = jsonStr.slice(1);
    const parsed = JSON.parse(jsonStr);
    // Accept both array format and {sheets:[...]} object wrapper
    const content = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.sheets) ? parsed.sheets : [];
    if (content.length === 0) return [];

    return content.map(sheet => {
        if (!sheet.rootTopic) return null;
        const rootNode = processNode(sheet.rootTopic, sheet.title || 'Untitled Map');

        // Sheet-level metadata
        if (sheet.topicPositioning) rootNode.topicPositioning = sheet.topicPositioning;
        if (sheet.floatingTopicFlexible) rootNode.floatingTopicFlexible = sheet.floatingTopicFlexible;

        // Detached topics (free-positioned nodes)
        if (sheet.rootTopic.children?.detached?.length > 0) {
            rootNode.detachedTopics = sheet.rootTopic.children.detached.map(
                dt => processNode(dt, sheet.title || 'Untitled Map')
            );
        }

        // Relationships with style (shape-class)
        if (sheet.relationships) {
            rootNode.relationships = sheet.relationships.map(rel => {
                const r = { id: rel.id, end1Id: rel.end1Id, end2Id: rel.end2Id };
                if (rel.title) r.title = rel.title;
                if (rel.style?.properties?.['shape-class']) r.shape = rel.style.properties['shape-class'];
                if (rel.controlPoints) r.controlPoints = rel.controlPoints;
                return r;
            });
        }

        return rootNode;
    }).filter(Boolean);
}

function parseXMind(filePath) {
    const buf = readFileSync(resolve(filePath));
    const zip = readZip(buf);
    const names = zip.names();
    const hasJson = names.includes('content.json');
    const hasXml = names.includes('content.xml');

    // Try zen (JSON) first; fall back to legacy (XML) if result is empty
    if (hasJson) {
        const result = parseXMindZen(filePath);
        if (result.length > 0) return result;
        // Zen was empty/stub — fall through to legacy if available
        if (hasXml) return parseXMindLegacy(filePath);
        return result;
    }
    if (hasXml) return parseXMindLegacy(filePath);
    throw new Error('Unknown XMind format: neither content.json nor content.xml found');
}

// ─── Helper: extract raw content.json text ───

function extractContentText(filePath) {
    try {
        const buf = readFileSync(resolve(filePath));
        const zip = readZip(buf);
        // Try JSON first, then XML
        const rawJson = zip.extract('content.json');
        if (rawJson) return rawJson.toString('utf-8');
        const rawXml = zip.extract('content.xml');
        if (rawXml) return rawXml.toString('utf-8');
        return null;
    } catch { return null; }
}

// ─── Actions ───

function actionRead(input) {
    if (!input.path) throw new Error('Missing "path"');
    return parseXMind(input.path);
}

function actionList(input) {
    const dir = resolve(input.directory || '.');
    const files = [];

    function scan(d) {
        let entries;
        try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const full = join(d, e.name);
            if (e.isDirectory()) scan(full);
            else if (e.isFile() && e.name.toLowerCase().endsWith('.xmind')) files.push(full);
        }
    }

    scan(dir);
    return files;
}

function actionSearchFiles(input) {
    if (!input.pattern && input.pattern !== '') throw new Error('Missing "pattern"');
    const dir = resolve(input.directory || '.');
    const pattern = input.pattern.toLowerCase();
    const filenameMatches = [];
    const contentMatches = [];

    function scan(d) {
        let entries;
        try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const full = join(d, e.name);
            if (e.isDirectory()) { scan(full); continue; }
            if (!e.isFile() || !e.name.toLowerCase().endsWith('.xmind')) continue;

            const searchable = [e.name.toLowerCase(), basename(e.name, '.xmind').toLowerCase(), full.toLowerCase()];
            if (pattern === '' || searchable.some(t => t.includes(pattern))) {
                filenameMatches.push(full);
            } else {
                const text = extractContentText(full);
                if (text && text.toLowerCase().includes(pattern)) contentMatches.push(full);
            }
        }
    }

    scan(dir);
    const sortByName = (a, b) => basename(a).localeCompare(basename(b));
    return [...filenameMatches.sort(sortByName), ...contentMatches.sort(sortByName)];
}

function actionReadMultiple(input) {
    if (!input.paths?.length) throw new Error('Missing "paths"');
    return input.paths.map(filePath => {
        try {
            return { filePath, content: parseXMind(filePath) };
        } catch (err) {
            return { filePath, content: [], error: err.message };
        }
    });
}

// ─── Node search helpers ───

function getNodePath(node, parents = []) {
    return parents.length > 0 ? `${parents.join(' > ')} > ${node.title}` : node.title;
}

function actionExtractNode(input) {
    if (!input.path || !input.searchQuery) throw new Error('Missing "path" or "searchQuery"');
    const sheets = parseXMind(input.path);

    function calculateRelevance(nodePath, query) {
        const pathLower = nodePath.toLowerCase();
        const queryLower = query.toLowerCase();
        if (pathLower.includes(queryLower)) return 1.0;
        const pathWords = pathLower.split(/[\s>]+/);
        const queryWords = queryLower.split(/[\s>]+/);
        const matching = queryWords.filter(w => pathWords.some(pw => pw.includes(w)));
        return matching.length / queryWords.length;
    }

    function findFuzzy(node, query, parents = []) {
        const results = [];
        const currentPath = getNodePath(node, parents);
        const confidence = calculateRelevance(currentPath, query);
        if (confidence > 0.5) results.push({ node, matchConfidence: confidence, path: currentPath });
        const newParents = [...parents, node.title];
        if (node.children) {
            for (const child of node.children) results.push(...findFuzzy(child, query, newParents));
        }
        if (node.detachedTopics) {
            for (const dt of node.detachedTopics) results.push(...findFuzzy(dt, query, newParents));
        }
        return results;
    }

    const allMatches = sheets.flatMap(sheet => findFuzzy(sheet, input.searchQuery));
    allMatches.sort((a, b) => b.matchConfidence - a.matchConfidence);

    return {
        matches: allMatches.slice(0, 5),
        totalMatches: allMatches.length,
        query: input.searchQuery,
    };
}

function actionExtractNodeById(input) {
    if (!input.path || !input.nodeId) throw new Error('Missing "path" or "nodeId"');
    const sheets = parseXMind(input.path);

    function findById(node, id) {
        if (node.id === id) return node;
        if (node.children) {
            for (const child of node.children) {
                const r = findById(child, id);
                if (r) return r;
            }
        }
        if (node.detachedTopics) {
            for (const dt of node.detachedTopics) {
                const r = findById(dt, id);
                if (r) return r;
            }
        }
        return null;
    }

    for (const sheet of sheets) {
        const found = findById(sheet, input.nodeId);
        if (found) return { found: true, node: found };
    }
    return { found: false, error: `Node not found: ${input.nodeId}` };
}

function actionSearchNodes(input) {
    if (!input.path || (input.query == null && !input.taskStatus)) throw new Error('Missing "path" and "query" or "taskStatus"');
    const sheets = parseXMind(input.path);
    const searchFields = input.searchIn || ['title', 'notes', 'labels', 'callouts', 'tasks'];
    const caseSensitive = input.caseSensitive || false;
    const searchQuery = input.query != null ? (caseSensitive ? input.query : input.query.toLowerCase()) : '';

    function matchesText(text) {
        if (!text) return false;
        const t = caseSensitive ? text : text.toLowerCase();
        return t.includes(searchQuery);
    }

    function search(node, parents = []) {
        const matches = [];

        const matchedIn = [];
        if (searchFields.includes('title') && matchesText(node.title)) matchedIn.push('title');
        if (searchFields.includes('notes') && node.notes?.content && matchesText(node.notes.content)) matchedIn.push('notes');
        if (searchFields.includes('labels') && node.labels?.some(l => matchesText(l))) matchedIn.push('labels');
        if (searchFields.includes('callouts') && node.callouts?.some(c => matchesText(c.title))) matchedIn.push('callouts');
        if (searchFields.includes('tasks') && node.taskStatus) matchedIn.push('tasks');

        const textMatched = searchQuery !== '' && matchedIn.length > 0;
        const taskMatched = input.taskStatus && node.taskStatus === input.taskStatus;
        // Task status filter: only include nodes that match, but always recurse into children
        const taskExcluded = input.taskStatus && node.taskStatus && node.taskStatus !== input.taskStatus;
        const shouldInclude = (textMatched || taskMatched) && !taskExcluded;

        if (shouldInclude && node.id) {
            const match = {
                id: node.id,
                title: node.title,
                path: getNodePath(node, parents),
                sheet: node.sheetTitle || 'Untitled Map',
                matchedIn,
            };
            if (node.notes?.content) match.notes = node.notes.content;
            if (node.labels) match.labels = node.labels;
            if (node.callouts) match.callouts = node.callouts;
            if (node.taskStatus) match.taskStatus = node.taskStatus;
            matches.push(match);
        }

        const newParents = [...parents, node.title];
        if (node.children) {
            for (const child of node.children) matches.push(...search(child, newParents));
        }
        if (node.detachedTopics) {
            for (const dt of node.detachedTopics) matches.push(...search(dt, newParents));
        }
        return matches;
    }

    const allMatches = sheets.flatMap(sheet => search(sheet));
    return {
        query: input.query,
        matches: allMatches,
        totalMatches: allMatches.length,
        searchedIn: searchFields,
    };
}

function actionFormatInfo(input) {
    if (!input.path) throw new Error('Missing "path"');
    const buf = readFileSync(resolve(input.path));
    const zip = readZip(buf);
    const names = zip.names();
    const hasJson = names.includes('content.json');
    const hasXml = names.includes('content.xml');

    let format, version, description;
    if (hasJson) {
        format = 'zen';
        version = 'XMind Zen / 2020+';
        description = 'Modern JSON-based format (content.json)';
    } else if (hasXml) {
        format = 'legacy';
        version = 'XMind 8 or earlier';
        description = 'Legacy XML-based format (content.xml)';
    } else {
        format = 'unknown';
        version = 'unknown';
        description = 'Could not determine format';
    }

    return {
        path: resolve(input.path),
        format,
        version,
        description,
        files: names,
    };
}

// ─── Main ───

const actions = {
    read: actionRead,
    list: actionList,
    search_files: actionSearchFiles,
    read_multiple: actionReadMultiple,
    extract_node: actionExtractNode,
    extract_node_by_id: actionExtractNodeById,
    search_nodes: actionSearchNodes,
    format_info: actionFormatInfo,
};

async function main() {
    let rawInput = '';
    for await (const chunk of process.stdin) rawInput += chunk;

    const input = JSON.parse(rawInput);
    if (!input.action) throw new Error('Missing "action" field');

    const handler = actions[input.action];
    if (!handler) throw new Error(`Unknown action: "${input.action}". Valid: ${Object.keys(actions).join(', ')}`);

    const result = handler(input);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main().catch(err => {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
});
