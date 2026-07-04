package com.nerdsdalibras.walletcategorizer.ai

import com.nerdsdalibras.walletcategorizer.data.Category
import org.json.JSONArray
import org.json.JSONObject

data class CategorizationResult(
    val merchant: String?,
    val amountCents: Long?,
    val categoryName: String,
    val confidence: Double,
    val reasoning: String,
    val isTransaction: Boolean,
)

/**
 * Sends a raw wallet/bank notification to Claude and asks it to extract the transaction
 * details and pick one of the user's categories, in a single structured-output call.
 */
class Categorizer(private val client: ClaudeClient, private val model: String) {

    fun categorize(
        sourcePackage: String,
        title: String,
        text: String,
        categories: List<Category>,
    ): CategorizationResult {
        val categoryNames = categories.map { it.name }
        val schema = JSONObject().apply {
            put("type", "object")
            put(
                "properties",
                JSONObject().apply {
                    put("is_transaction", JSONObject().apply {
                        put("type", "boolean")
                        put("description", "Whether this notification represents an actual purchase/payment (not a balance alert, marketing, or security prompt)")
                    })
                    put("merchant", JSONObject().apply {
                        put("type", "string")
                        put("description", "Merchant or payee name extracted from the notification, or empty string if unknown")
                    })
                    put("amount_cents", JSONObject().apply {
                        put("type", "integer")
                        put("description", "Transaction amount in cents (e.g. R$ 45,90 -> 4590). 0 if not a transaction or amount not found.")
                    })
                    put("category", JSONObject().apply {
                        put("type", "string")
                        put("enum", JSONArray(categoryNames))
                        put("description", "Best matching category from the provided list")
                    })
                    put("confidence", JSONObject().apply {
                        put("type", "number")
                        put("description", "Confidence from 0.0 to 1.0 in the category assignment")
                    })
                    put("reasoning", JSONObject().apply {
                        put("type", "string")
                        put("description", "One short sentence explaining the categorization")
                    })
                },
            )
            put("required", JSONArray(listOf("is_transaction", "merchant", "amount_cents", "category", "confidence", "reasoning")))
            put("additionalProperties", false)
        }

        val systemPrompt = """
            Você analisa notificações de carteiras digitais e apps bancários brasileiros para
            extrair dados de transação e categorizar o gasto. App de origem: $sourcePackage.
            Categorias disponíveis: ${categoryNames.joinToString(", ")}.
            Se a notificação não representar uma compra/pagamento real (ex: alerta de saldo,
            marketing, confirmação de login), defina is_transaction como false.
        """.trimIndent()

        val body = JSONObject().apply {
            put("model", model)
            put("max_tokens", 1024)
            put("system", systemPrompt)
            put(
                "messages",
                JSONArray().put(
                    JSONObject().apply {
                        put("role", "user")
                        put("content", "Título: $title\nTexto: $text")
                    },
                ),
            )
            put(
                "output_config",
                JSONObject().apply {
                    put("format", JSONObject().apply {
                        put("type", "json_schema")
                        put("schema", schema)
                    })
                },
            )
        }

        val response = client.createMessage(body)
        val json = JSONObject(client.firstText(response))
        return CategorizationResult(
            merchant = json.optString("merchant").ifBlank { null },
            amountCents = json.optLong("amount_cents").takeIf { it > 0 },
            categoryName = json.optString("category"),
            confidence = json.optDouble("confidence", 0.0),
            reasoning = json.optString("reasoning"),
            isTransaction = json.optBoolean("is_transaction", true),
        )
    }
}
