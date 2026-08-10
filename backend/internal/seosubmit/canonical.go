package seosubmit

import (
	"fmt"
	"net/url"
	"path"
	"strings"
)

// canonicalSite is the single authority used by every IndexNow field.  Keeping
// the parsed value here prevents host, urlList and keyLocation from drifting
// apart through ad-hoc string concatenation.
type canonicalSite struct {
	origin string
	host   string
}

func parseCanonicalSite(raw string) (canonicalSite, error) {
	if raw == "" {
		return canonicalSite{}, fmt.Errorf("%w: canonical base URL is empty", errIndexNowConfig)
	}
	u, err := url.Parse(raw)
	if err != nil {
		return canonicalSite{}, fmt.Errorf("%w: parse canonical base URL: %v", errIndexNowConfig, err)
	}
	if u.Scheme != "https" || u.Hostname() == "" || u.Port() != "" || u.User != nil ||
		u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		return canonicalSite{}, fmt.Errorf("%w: canonical base URL must be an origin-only https URL", errIndexNowConfig)
	}
	host := strings.ToLower(u.Hostname())
	if !strings.HasPrefix(host, "www.") || len(host) <= len("www.") {
		return canonicalSite{}, fmt.Errorf("%w: canonical host must use the www hostname", errIndexNowConfig)
	}
	origin := "https://" + host
	if raw != origin {
		return canonicalSite{}, fmt.Errorf("%w: canonical base URL must be exactly %q", errIndexNowConfig, origin)
	}
	return canonicalSite{origin: origin, host: host}, nil
}

func (s canonicalSite) canonicalURL(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("%w: parse URL: %v", errIndexNowConfig, err)
	}
	if u.Scheme != "https" || !strings.EqualFold(u.Hostname(), s.host) ||
		u.Host != s.host || u.Port() != "" || u.User != nil ||
		u.RawQuery != "" || u.Fragment != "" {
		return "", fmt.Errorf("%w: URL is not on canonical origin %s", errIndexNowConfig, s.origin)
	}
	p := u.EscapedPath()
	if p == "" {
		p = "/"
	}
	if err := validateCanonicalPath(u.Path); err != nil {
		return "", err
	}
	return s.origin + p, nil
}

func (s canonicalSite) canonicalPath(raw string) (string, error) {
	if raw == "" {
		return "", fmt.Errorf("%w: empty path", errIndexNowConfig)
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("%w: parse path: %v", errIndexNowConfig, err)
	}
	if u.IsAbs() || u.Host != "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return "", fmt.Errorf("%w: enqueue path must be a path without host, query, or fragment", errIndexNowConfig)
	}
	if !strings.HasPrefix(u.Path, "/") {
		u.Path = "/" + u.Path
		u.RawPath = ""
	}
	if err := validateCanonicalPath(u.Path); err != nil {
		return "", err
	}
	p := u.EscapedPath()
	if p == "" {
		p = "/"
	}
	return s.origin + p, nil
}

func validateCanonicalPath(p string) error {
	if p == "" || p[0] != '/' || strings.Contains(p, "//") {
		return fmt.Errorf("%w: URL path is not canonical", errIndexNowConfig)
	}
	// path.Clean also detects dot segments. Preserve an intentional trailing
	// slash, because whether a route owns one is an application-level choice.
	trimmed := strings.TrimSuffix(p, "/")
	if trimmed == "" {
		trimmed = "/"
	}
	if path.Clean(trimmed) != trimmed {
		return fmt.Errorf("%w: URL path contains dot segments", errIndexNowConfig)
	}
	return nil
}

func (s canonicalSite) canonicalURLs(raw []string) ([]string, error) {
	out := make([]string, 0, len(raw))
	seen := make(map[string]struct{}, len(raw))
	for _, value := range raw {
		canonical, err := s.canonicalURL(value)
		if err != nil {
			return nil, fmt.Errorf("%w: rejected URL %q", err, value)
		}
		if _, ok := seen[canonical]; ok {
			continue
		}
		seen[canonical] = struct{}{}
		out = append(out, canonical)
	}
	return out, nil
}
