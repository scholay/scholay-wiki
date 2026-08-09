package config

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"scholar-backend/internal/common/model"
)

func TestInjectCodeSnippetsSeparatesImmediateAndDeferredAtEveryPosition(t *testing.T) {
	t.Parallel()

	const (
		immediateHead      = `<meta name="immediate-head" content="$1">`
		deferredHead       = `<script>window.snippetEvents.push("deferred-head")</script>`
		immediateBodyStart = `<script>window.immediateBodyStart = "$&"</script>`
		deferredBodyStart  = `<div id="deferred-body-start">deferred start</div>`
		immediateBodyEnd   = `<div id="immediate-body-end">immediate end</div>`
		deferredBodyEnd    = `<script>window.snippetEvents.push("deferred-body-end")</script>`
	)

	page := `<!doctype html><html><head><title>SSR</title></head><body class="app"><main>application</main></body></html>`
	snippets := &model.CodeSnippetsGroupedResponse{
		Head: []model.CodeSnippetResponse{
			{CodeContent: immediateHead},
			{CodeContent: deferredHead, DeferUntilIdle: true},
		},
		BodyStart: []model.CodeSnippetResponse{
			{CodeContent: immediateBodyStart},
			{CodeContent: deferredBodyStart, DeferUntilIdle: true},
		},
		BodyEnd: []model.CodeSnippetResponse{
			{CodeContent: immediateBodyEnd},
			{CodeContent: deferredBodyEnd, DeferUntilIdle: true},
		},
	}

	got := (&Handler{}).injectCodeSnippets(page, snippets)

	// Immediate snippets remain byte-for-byte intact. The '$' assertions also
	// guard against regexp replacement expansion corrupting body_start scripts.
	for _, immediate := range []string{immediateHead, immediateBodyStart, immediateBodyEnd} {
		if count := strings.Count(got, immediate); count != 1 {
			t.Fatalf("immediate snippet count = %d, want 1 for %q\n%s", count, immediate, got)
		}
	}

	headEnd := strings.Index(got, "</head>")
	if headAt := strings.Index(got, immediateHead); headAt < 0 || headAt > headEnd {
		t.Fatalf("immediate head snippet was not injected before </head>: %s", got)
	}
	bodyOpenEnd := strings.Index(got, `<body class="app">`) + len(`<body class="app">`)
	mainStart := strings.Index(got, "<main>")
	if bodyStartAt := strings.Index(got, immediateBodyStart); bodyStartAt < bodyOpenEnd || bodyStartAt > mainStart {
		t.Fatalf("immediate body_start snippet was not injected directly after <body>: %s", got)
	}
	mainEnd := strings.Index(got, "</main>")
	bodyEnd := strings.Index(got, "</body>")
	if bodyEndAt := strings.Index(got, immediateBodyEnd); bodyEndAt < mainEnd || bodyEndAt > bodyEnd {
		t.Fatalf("immediate body_end snippet was not injected before </body>: %s", got)
	}

	// Deferred HTML must never appear raw in parser-executed SSR markup. It is
	// encoded once in the wrapper payload, so closing script tags cannot escape.
	for _, deferred := range []string{deferredHead, deferredBodyStart, deferredBodyEnd} {
		if strings.Contains(got, deferred) {
			t.Fatalf("deferred snippet was injected as raw HTML: %q\n%s", deferred, got)
		}
	}
	if count := strings.Count(got, "data-ssr-deferred-snippets"); count != 1 {
		t.Fatalf("deferred runtime count = %d, want 1", count)
	}
	if count := strings.Count(got, "window.__SSR_SNIPPETS_INJECTED__=true"); count != 1 {
		t.Fatalf("SSR injection flag count = %d, want 1", count)
	}
	if !strings.Contains(got, "window.addEventListener('load',schedule,{once:true})") ||
		!strings.Contains(got, "window.requestIdleCallback(inject,{timeout:2000})") {
		t.Fatalf("deferred runtime does not preserve load + idle scheduling: %s", got)
	}

	// Decode the embedded JSON to prove that every deferred group retains its
	// configured location and appears exactly once in the single SSR runtime.
	wrapperStart := strings.Index(got, `<script data-ssr-deferred-snippets>`)
	if wrapperStart < 0 {
		t.Fatalf("deferred runtime wrapper not found: %s", got)
	}
	wrapperEndOffset := strings.Index(got[wrapperStart:], `</script>`)
	if wrapperEndOffset < 0 {
		t.Fatalf("deferred runtime wrapper not found: %s", got)
	}
	wrapper := got[wrapperStart : wrapperStart+wrapperEndOffset+len(`</script>`)]
	payloadStart := strings.LastIndex(wrapper, `})(`)
	payloadEnd := strings.LastIndex(wrapper, `);</script>`)
	if payloadStart < 0 || payloadEnd < payloadStart {
		t.Fatalf("deferred runtime payload boundaries not found: %s", wrapper)
	}

	var payload deferredSnippetPayload
	if err := json.Unmarshal([]byte(wrapper[payloadStart+len(`})(`):payloadEnd]), &payload); err != nil {
		t.Fatalf("decode deferred runtime payload: %v\n%s", err, wrapper)
	}
	want := deferredSnippetPayload{
		Head:      []string{deferredHead},
		BodyStart: []string{deferredBodyStart},
		BodyEnd:   []string{deferredBodyEnd},
	}
	if !reflect.DeepEqual(payload, want) {
		t.Fatalf("deferred payload = %#v, want %#v", payload, want)
	}
}
