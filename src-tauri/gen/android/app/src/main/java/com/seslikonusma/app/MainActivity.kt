package com.seslikonusma.app

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onResume() {
      super.onResume()
      val webView = findViewById<WebView>(R.id.webview)
      if (webView != null) {
          webView.webChromeClient = object : WebChromeClient() {
              override fun onPermissionRequest(request: PermissionRequest) {
                  request.grant(request.resources)
              }
          }
      }
  }
}
