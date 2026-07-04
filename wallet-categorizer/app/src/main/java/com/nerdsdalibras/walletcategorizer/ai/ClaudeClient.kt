package com.nerdsdalibras.walletcategorizer.ai

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

private const val ANTHROPIC_VERSION = "2023-06-01"
private const val MESSAGES_URL = "https://api.anthropic.com/v1/messages"
private val JSON_MEDIA_TYPE = "application/json".toMediaType()

class ClaudeApiException(message: String, val statusCode: Int? = null) : Exception(message)

/** Thin wrapper over the Anthropic Messages API (POST /v1/messages) via raw HTTP. */
class ClaudeClient(private val apiKey: String) {

    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    /** Sends a single non-streaming Messages API request and returns the parsed JSON response. */
    fun createMessage(body: JSONObject): JSONObject {
        val request = Request.Builder()
            .url(MESSAGES_URL)
            .addHeader("x-api-key", apiKey)
            .addHeader("anthropic-version", ANTHROPIC_VERSION)
            .addHeader("content-type", "application/json")
            .post(body.toString().toRequestBody(JSON_MEDIA_TYPE))
            .build()

        http.newCall(request).execute().use { response ->
            val responseBody = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val message = runCatching { JSONObject(responseBody).getJSONObject("error").getString("message") }
                    .getOrDefault(responseBody)
                throw ClaudeApiException(message, response.code)
            }
            return JSONObject(responseBody)
        }
    }

    /** Extracts the first text block from a Messages API response. */
    fun firstText(response: JSONObject): String {
        val content = response.optJSONArray("content") ?: return ""
        for (i in 0 until content.length()) {
            val block = content.getJSONObject(i)
            if (block.optString("type") == "text") {
                return block.optString("text")
            }
        }
        return ""
    }
}
