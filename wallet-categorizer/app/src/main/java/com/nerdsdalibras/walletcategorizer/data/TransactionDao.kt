package com.nerdsdalibras.walletcategorizer.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

data class CategorySpend(
    val categoryId: Long?,
    val totalCents: Long,
    val count: Int,
)

@Dao
interface TransactionDao {

    @Query("SELECT * FROM transactions ORDER BY timestamp DESC")
    fun observeAll(): Flow<List<Transaction>>

    @Query("SELECT * FROM transactions WHERE rawTitle = :title AND rawText = :text AND sourcePackage = :pkg LIMIT 1")
    suspend fun findDuplicate(title: String, text: String, pkg: String): Transaction?

    @Insert
    suspend fun insert(transaction: Transaction): Long

    @Update
    suspend fun update(transaction: Transaction)

    @Query(
        """
        SELECT categoryId, SUM(amountCents) AS totalCents, COUNT(*) AS count
        FROM transactions
        WHERE timestamp BETWEEN :startMillis AND :endMillis AND status = 'CATEGORIZED'
        GROUP BY categoryId
        """
    )
    suspend fun spendByCategory(startMillis: Long, endMillis: Long): List<CategorySpend>

    @Query("SELECT * FROM transactions WHERE timestamp BETWEEN :startMillis AND :endMillis ORDER BY timestamp DESC")
    suspend fun findInRange(startMillis: Long, endMillis: Long): List<Transaction>
}
