package com.nerdsdalibras.walletcategorizer.notification

/** Cheap local pre-filter so we don't spend an API call on notifications that clearly aren't transactions. */
object NotificationParser {

    private val CURRENCY_PATTERN = Regex("""R\$\s?\d""")

    fun looksLikeTransaction(title: String, text: String): Boolean {
        val combined = "$title $text"
        return CURRENCY_PATTERN.containsMatchIn(combined)
    }
}
