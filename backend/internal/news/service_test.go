package news

import "testing"

func TestProxifyImageURL(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"minicod uploads png", "https://www.minicod.com/uploads/news/images/2026/06/x.png", "/img-remote/minicod/news/images/2026/06/x.png"},
		{"minicod uploads with query", "https://www.minicod.com/uploads/a/b.png?v=2", "/img-remote/minicod/a/b.png?v=2"},
		{"empty", "", ""},
		{"already relative", "/img-remote/minicod/x.png", "/img-remote/minicod/x.png"},
		{"other host untouched", "https://cdn.example.com/uploads/x.png", "https://cdn.example.com/uploads/x.png"},
		{"minicod non-uploads untouched", "https://www.minicod.com/static/x.png", "https://www.minicod.com/static/x.png"},
		{"apex minicod untouched (nginx upstream is www)", "https://minicod.com/uploads/x.png", "https://minicod.com/uploads/x.png"},
		{"host case-insensitive", "https://WWW.Minicod.com/uploads/x.png", "/img-remote/minicod/x.png"},
		{"garbage passthrough", "not a url", "not a url"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := proxifyImageURL(c.in); got != c.want {
				t.Fatalf("proxifyImageURL(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

func TestStripInlineFigures(t *testing.T) {
	in := "第一段正文文字。\n\n" +
		`<figure> <img src="https://www.minicod.com/uploads/news/images/2026/06/x.png" alt="标题" /> <figcaption>图注文字</figcaption> </figure>` +
		"\n\n第二段正文文字。"
	got := stripInlineFigures(in)
	want := "第一段正文文字。\n\n第二段正文文字。"
	if got != want {
		t.Fatalf("stripInlineFigures dropped/kept wrong content:\n got=%q\nwant=%q", got, want)
	}

	// 不含 figure 的正文原样保留(去首尾空白外不改动)。
	plain := "只是一段普通 markdown 正文,含 [链接](https://a.b) 与 **粗体**。"
	if got := stripInlineFigures(plain); got != plain {
		t.Fatalf("stripInlineFigures mangled plain markdown:\n got=%q\nwant=%q", got, plain)
	}

	// 多张图 + 裸 img/figcaption 也一并清除。
	multi := "A\n\n<figure><img src=\"1.png\"></figure>\n\n<img src=\"2.png\"/>\n\nB"
	if got := stripInlineFigures(multi); got != "A\n\nB" {
		t.Fatalf("stripInlineFigures multi = %q, want %q", got, "A\n\nB")
	}

	if got := stripInlineFigures(""); got != "" {
		t.Fatalf("stripInlineFigures(\"\") = %q, want empty", got)
	}
}
