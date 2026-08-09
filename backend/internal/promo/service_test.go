package promo

import (
	"strings"
	"testing"
)

func TestMakePublicSummaryKeepsQRCodeOutOfColdConfig(t *testing.T) {
	view := makePublicSummary(&PromoConfig{
		Enabled:    true,
		Title:      "限时领取",
		ButtonText: "扫码",
		WechatQR:   "data:image/png;base64,iVBORw0KGgo=",
	})

	if !view.Enabled || view.Title != "限时领取" || view.ButtonText != "扫码" {
		t.Fatalf("unexpected summary: %#v", view)
	}
	if !strings.HasPrefix(view.WechatQRURL, publicQRURL+"?v=") {
		t.Fatalf("qr url = %q, want versioned %q", view.WechatQRURL, publicQRURL)
	}
}

func TestMakePublicSummaryChangesQRURLWithContent(t *testing.T) {
	first := makePublicSummary(&PromoConfig{Enabled: true, WechatQR: "data:image/png;base64,AAAA"})
	second := makePublicSummary(&PromoConfig{Enabled: true, WechatQR: "data:image/png;base64,BBBB"})
	if first.WechatQRURL == second.WechatQRURL {
		t.Fatalf("different QR contents shared URL %q", first.WechatQRURL)
	}
}

func TestMakePublicSummaryDisabledDoesNotLeakFields(t *testing.T) {
	view := makePublicSummary(&PromoConfig{
		Enabled:  false,
		Title:    "should not leak",
		WechatQR: "data:image/png;base64,iVBORw0KGgo=",
	})

	if view.Enabled || view.Title != "" || view.WechatQRURL != "" {
		t.Fatalf("disabled summary leaked config: %#v", view)
	}
}

func TestMakePublicSummaryWithoutQRCodeHasNoBrokenURL(t *testing.T) {
	view := makePublicSummary(&PromoConfig{Enabled: true, Title: "on"})
	if view.WechatQRURL != "" {
		t.Fatalf("empty QR should not advertise an endpoint: %#v", view)
	}
}
