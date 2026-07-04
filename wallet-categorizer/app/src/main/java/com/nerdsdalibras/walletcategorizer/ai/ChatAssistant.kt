package com.nerdsdalibras.walletcategorizer.ai

import com.nerdsdalibras.walletcategorizer.data.Category
import com.nerdsdalibras.walletcategorizer.data.Transaction
import org.json.JSONArray
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale

data class ChatMessage(val role: String, val content: String)

/**
 * Answers free-form questions about the user's categorized spending. Builds a compact
 * summary of recent transactions as context rather than dumping the full history.
 */
class ChatAssistant(private val client: ClaudeClient, private val model: String) {

    fun ask(
        history: List<ChatMessage>,
        question: String,
        recentTransactions: List<Transaction>,
        categories: List<Category>,
    ): String {
        val categoryById = categories.associateBy { it.id }
        val currency = NumberFormat.getCurrencyInstance(Locale("pt", "BR"))

        val summary = buildString {
            appendLine("Transações recentes (mais novas primeiro):")
            recentTransactions.take(200).forEach { tx ->
                val categoryName = tx.categoryId?.let { categoryById[it]?.name } ?: "Sem categoria"
                val amount = tx.amountCents?.let { currency.format(it / 100.0) } ?: "?"
                appendLine("- ${tx.merchant ?: "Desconhecido"} | $amount | $categoryName")
            }
        }

        val systemPrompt = """
            Você é um assistente financeiro pessoal. Responda perguntas do usuário sobre os
            gastos dele com base exclusivamente nos dados fornecidos abaixo. Se a pergunta não
            puder ser respondida com esses dados, diga isso claramente. Responda em português,
            de forma direta e objetiva.

            $summary
        """.trimIndent()

        val messages = JSONArray()
        history.forEach { msg ->
            messages.put(JSONObject().apply {
                put("role", msg.role)
                put("content", msg.content)
            })
        }
        messages.put(JSONObject().apply {
            put("role", "user")
            put("content", question)
        })

        val body = JSONObject().apply {
            put("model", model)
            put("max_tokens", 1024)
            put("system", systemPrompt)
            put("messages", messages)
        }

        val response = client.createMessage(body)
        return client.firstText(response)
    }
}
