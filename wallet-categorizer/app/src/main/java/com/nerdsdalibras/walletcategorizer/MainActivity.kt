package com.nerdsdalibras.walletcategorizer

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Category
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.nerdsdalibras.walletcategorizer.ui.navigation.Destination
import com.nerdsdalibras.walletcategorizer.ui.navigation.walletNavGraph
import com.nerdsdalibras.walletcategorizer.ui.theme.WalletCategorizerTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val repository = (application as WalletCategorizerApp).repository
        setContent {
            WalletCategorizerTheme {
                val navController = rememberNavController()
                val destinations = listOf(Destination.Transactions, Destination.Categories, Destination.Chat, Destination.Settings)

                Scaffold(
                    bottomBar = {
                        NavigationBar {
                            val backStackEntry by navController.currentBackStackEntryAsState()
                            val currentDestination = backStackEntry?.destination
                            destinations.forEach { destination ->
                                NavigationBarItem(
                                    selected = currentDestination?.hierarchy?.any { it.route == destination.route } == true,
                                    onClick = {
                                        navController.navigate(destination.route) {
                                            popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                            launchSingleTop = true
                                            restoreState = true
                                        }
                                    },
                                    icon = {
                                        Icon(
                                            imageVector = when (destination) {
                                                Destination.Transactions -> Icons.Filled.List
                                                Destination.Categories -> Icons.Filled.Category
                                                Destination.Chat -> Icons.Filled.Chat
                                                Destination.Settings -> Icons.Filled.Settings
                                            },
                                            contentDescription = destination.label,
                                        )
                                    },
                                    label = { Text(destination.label) },
                                )
                            }
                        }
                    },
                ) { padding ->
                    NavHost(
                        navController = navController,
                        startDestination = Destination.Transactions.route,
                        modifier = Modifier.padding(padding),
                    ) {
                        walletNavGraph(this, repository)
                    }
                }
            }
        }
    }
}
