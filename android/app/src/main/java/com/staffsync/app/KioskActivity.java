package com.staffsync.app;

import android.content.pm.ActivityInfo;
import android.os.Bundle;
import android.webkit.WebView;

/**
 * Second home-screen icon ("Staff Kiosk") that opens the app straight into
 * Face Attendance kiosk mode, locked to portrait with the screen kept on.
 */
public class KioskActivity extends MainActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            String base = getBridge().getAppUrl();
            if (base == null) base = "https://localhost/";
            String url = base + (base.contains("?") ? "&" : "?") + "kiosk=1";
            webView.loadUrl(url);
        }
    }
}
