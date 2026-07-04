package com.nerdsdalibras.walletcategorizer.notification

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.nerdsdalibras.walletcategorizer.WalletCategorizerApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class WalletNotificationListener : NotificationListenerService() {

    private lateinit var scope: CoroutineScope

    override fun onCreate() {
        super.onCreate()
        scope = CoroutineScope(Dispatchers.IO + Job())
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val app = applicationContext as WalletCategorizerApp
        val allowlist = app.repository.currentAllowlist()
        if (sbn.packageName !in allowlist) return

        val extras = sbn.notification.extras
        val title = extras.getCharSequence("android.title")?.toString().orEmpty()
        val text = extras.getCharSequence("android.text")?.toString().orEmpty()
        if (title.isBlank() && text.isBlank()) return
        if (!NotificationParser.looksLikeTransaction(title, text)) return

        scope.launch {
            app.repository.processNotification(sbn.packageName, title, text)
        }
    }
}
