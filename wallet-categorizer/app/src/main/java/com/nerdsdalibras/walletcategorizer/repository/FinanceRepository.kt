package com.nerdsdalibras.walletcategorizer.repository

import com.nerdsdalibras.walletcategorizer.ai.ChatAssistant
import com.nerdsdalibras.walletcategorizer.ai.ChatMessage
import com.nerdsdalibras.walletcategorizer.ai.Categorizer
import com.nerdsdalibras.walletcategorizer.ai.ClaudeClient
import com.nerdsdalibras.walletcategorizer.data.Category
import com.nerdsdalibras.walletcategorizer.data.CategoryDao
import com.nerdsdalibras.walletcategorizer.data.Transaction
import com.nerdsdalibras.walletcategorizer.data.TransactionDao
import com.nerdsdalibras.walletcategorizer.data.TransactionStatus
import com.nerdsdalibras.walletcategorizer.util.SecurePrefs
import kotlinx.coroutines.flow.Flow

class FinanceRepository(
    private val categoryDao: CategoryDao,
    private val transactionDao: TransactionDao,
    private val prefs: SecurePrefs,
) {

    fun observeCategories(): Flow<List<Category>> = categoryDao.observeAll()

    fun observeTransactions(): Flow<List<Transaction>> = transactionDao.observeAll()

    suspend fun addCategory(name: String, colorHex: String) {
        categoryDao.insert(Category(name = name, colorHex = colorHex))
    }

    suspend fun deleteCategory(category: Category) {
        categoryDao.delete(category)
    }

    suspend fun setTransactionCategory(transaction: Transaction, categoryId: Long) {
        transactionDao.update(transaction.copy(categoryId = categoryId, status = TransactionStatus.CATEGORIZED))
    }

    /**
     * Persists a raw notification and, if an API key is configured, asks Claude to extract
     * the transaction details and categorize it. Returns the stored transaction, or null if
     * it was a duplicate of one already recorded.
     */
    suspend fun processNotification(sourcePackage: String, title: String, text: String): Transaction? {
        if (transactionDao.findDuplicate(title, text, sourcePackage) != null) return null

        var transaction = Transaction(
            timestamp = System.currentTimeMillis(),
            sourcePackage = sourcePackage,
            rawTitle = title,
            rawText = text,
        )
        val id = transactionDao.insert(transaction)
        transaction = transaction.copy(id = id)

        val apiKey = prefs.apiKey ?: return transaction
        val categories = categoryDao.getAll()
        if (categories.isEmpty()) return transaction

        return try {
            val client = ClaudeClient(apiKey)
            val result = Categorizer(client, prefs.model).categorize(sourcePackage, title, text, categories)
            if (!result.isTransaction) {
                transaction = transaction.copy(status = TransactionStatus.ERROR, aiReasoning = "Não é uma transação")
                transactionDao.update(transaction)
                return transaction
            }
            val category = categories.firstOrNull { it.name.equals(result.categoryName, ignoreCase = true) }
                ?: categories.first { it.name == "Outros" }
            transaction = transaction.copy(
                merchant = result.merchant,
                amountCents = result.amountCents,
                categoryId = category.id,
                aiConfidence = result.confidence,
                aiReasoning = result.reasoning,
                status = TransactionStatus.CATEGORIZED,
            )
            transactionDao.update(transaction)
            transaction
        } catch (e: Exception) {
            transaction = transaction.copy(status = TransactionStatus.ERROR, aiReasoning = e.message)
            transactionDao.update(transaction)
            transaction
        }
    }

    suspend fun askAssistant(history: List<ChatMessage>, question: String): String {
        val apiKey = prefs.apiKey ?: return "Configure sua chave de API da Anthropic em Ajustes primeiro."
        val client = ClaudeClient(apiKey)
        val categories = categoryDao.getAll()
        val transactions = transactionDao.findInRange(0, System.currentTimeMillis())
        return ChatAssistant(client, prefs.model).ask(history, question, transactions, categories)
    }

    fun currentAllowlist(): Set<String> = prefs.packageAllowlist

    fun updateAllowlist(packages: Set<String>) {
        prefs.packageAllowlist = packages
    }

    fun currentApiKey(): String? = prefs.apiKey

    fun updateApiKey(key: String) {
        prefs.apiKey = key
    }

    fun currentModel(): String = prefs.model

    fun updateModel(model: String) {
        prefs.model = model
    }
}
