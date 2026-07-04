package com.nerdsdalibras.walletcategorizer.util

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

private const val KEY_API_KEY = "anthropic_api_key"
private const val KEY_MODEL = "claude_model"
private const val KEY_PACKAGE_ALLOWLIST = "package_allowlist"

const val DEFAULT_MODEL = "claude-opus-4-8"

val DEFAULT_PACKAGE_ALLOWLIST = setOf(
    "com.google.android.apps.walletnfcrel",
    "com.nu.production",
    "com.itau",
    "com.itau.investimentos",
    "com.bradesco",
    "com.bb.android",
    "br.com.intermedium",
    "com.picpay",
    "com.c6bank.app",
    "com.santander.app",
    "com.original.app",
    "br.com.stone",
    "com.portoseguro.app",
)

class SecurePrefs(context: Context) {

    private val prefs: SharedPreferences

    init {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        prefs = EncryptedSharedPreferences.create(
            context,
            "secure_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    var apiKey: String?
        get() = prefs.getString(KEY_API_KEY, null)
        set(value) = prefs.edit().putString(KEY_API_KEY, value).apply()

    var model: String
        get() = prefs.getString(KEY_MODEL, DEFAULT_MODEL) ?: DEFAULT_MODEL
        set(value) = prefs.edit().putString(KEY_MODEL, value).apply()

    var packageAllowlist: Set<String>
        get() = prefs.getStringSet(KEY_PACKAGE_ALLOWLIST, DEFAULT_PACKAGE_ALLOWLIST) ?: DEFAULT_PACKAGE_ALLOWLIST
        set(value) = prefs.edit().putStringSet(KEY_PACKAGE_ALLOWLIST, value).apply()
}
