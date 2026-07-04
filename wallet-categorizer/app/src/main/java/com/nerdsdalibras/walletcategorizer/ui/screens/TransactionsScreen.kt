package com.nerdsdalibras.walletcategorizer.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Divider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nerdsdalibras.walletcategorizer.data.Category
import com.nerdsdalibras.walletcategorizer.data.Transaction
import com.nerdsdalibras.walletcategorizer.repository.FinanceRepository
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun TransactionsScreen(repository: FinanceRepository) {
    val transactions by repository.observeTransactions().collectAsState(initial = emptyList())
    val categories by repository.observeCategories().collectAsState(initial = emptyList())
    val categoryById = categories.associateBy { it.id }
    val scope = rememberCoroutineScope()
    var pickerFor by remember { mutableStateOf<Transaction?>(null) }

    if (transactions.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize()) {
            Text(
                "Nenhum gasto ainda. Ative o acesso a notificações em Ajustes e faça uma compra com sua carteira digital.",
                modifier = Modifier.padding(24.dp),
            )
        }
        return
    }

    LazyColumn(modifier = Modifier.fillMaxSize()) {
        items(transactions, key = { it.id }) { tx ->
            TransactionRow(tx, categoryById[tx.categoryId]) { pickerFor = tx }
            Divider()
        }
    }

    val target = pickerFor
    if (target != null) {
        AlertDialog(
            onDismissRequest = { pickerFor = null },
            title = { Text("Escolher categoria") },
            text = {
                Column {
                    categories.forEach { category ->
                        Text(
                            category.name,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    scope.launch { repository.setTransactionCategory(target, category.id) }
                                    pickerFor = null
                                }
                                .padding(12.dp),
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { pickerFor = null }) { Text("Cancelar") }
            },
        )
    }
}

@Composable
private fun TransactionRow(tx: Transaction, category: Category?, onClick: () -> Unit) {
    val currency = remember { NumberFormat.getCurrencyInstance(Locale("pt", "BR")) }
    val dateFormat = remember { SimpleDateFormat("dd/MM HH:mm", Locale.getDefault()) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column {
            Text(tx.merchant ?: tx.rawTitle, fontWeight = FontWeight.Bold)
            Text(dateFormat.format(Date(tx.timestamp)))
        }
        Column(horizontalAlignment = androidx.compose.ui.Alignment.End) {
            Text(tx.amountCents?.let { currency.format(it / 100.0) } ?: "—", fontWeight = FontWeight.Bold)
            CategoryChip(category)
        }
    }
}

@Composable
private fun CategoryChip(category: Category?) {
    val color = category?.colorHex?.let { runCatching { Color(android.graphics.Color.parseColor(it)) }.getOrNull() }
        ?: Color.Gray
    Row {
        Box(modifier = Modifier.size(10.dp).background(color, CircleShape))
        Text(" ${category?.name ?: "Sem categoria"}")
    }
}
