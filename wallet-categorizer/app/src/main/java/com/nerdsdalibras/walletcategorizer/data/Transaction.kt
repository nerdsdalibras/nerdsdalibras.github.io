package com.nerdsdalibras.walletcategorizer.data

import androidx.room.Entity
import androidx.room.PrimaryKey

enum class TransactionStatus { PENDING, CATEGORIZED, ERROR }

@Entity(tableName = "transactions")
data class Transaction(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val timestamp: Long,
    val sourcePackage: String,
    val rawTitle: String,
    val rawText: String,
    val merchant: String? = null,
    val amountCents: Long? = null,
    val categoryId: Long? = null,
    val aiConfidence: Double? = null,
    val aiReasoning: String? = null,
    val status: TransactionStatus = TransactionStatus.PENDING,
)
