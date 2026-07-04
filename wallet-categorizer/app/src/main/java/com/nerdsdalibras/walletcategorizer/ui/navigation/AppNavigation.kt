package com.nerdsdalibras.walletcategorizer.ui.navigation

import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import com.nerdsdalibras.walletcategorizer.repository.FinanceRepository
import com.nerdsdalibras.walletcategorizer.ui.screens.CategoriesScreen
import com.nerdsdalibras.walletcategorizer.ui.screens.ChatScreen
import com.nerdsdalibras.walletcategorizer.ui.screens.SettingsScreen
import com.nerdsdalibras.walletcategorizer.ui.screens.TransactionsScreen

sealed class Destination(val route: String, val label: String) {
    object Transactions : Destination("transactions", "Gastos")
    object Categories : Destination("categories", "Categorias")
    object Chat : Destination("chat", "Assistente")
    object Settings : Destination("settings", "Ajustes")
}

fun walletNavGraph(builder: NavGraphBuilder, repository: FinanceRepository) {
    builder.composable(Destination.Transactions.route) { TransactionsScreen(repository) }
    builder.composable(Destination.Categories.route) { CategoriesScreen(repository) }
    builder.composable(Destination.Chat.route) { ChatScreen(repository) }
    builder.composable(Destination.Settings.route) { SettingsScreen(repository) }
}
