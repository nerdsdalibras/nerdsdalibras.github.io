package com.nerdsdalibras.walletcategorizer.ui.screens

import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.nerdsdalibras.walletcategorizer.repository.FinanceRepository

private val AVAILABLE_MODELS = listOf("claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(repository: FinanceRepository) {
    val context = LocalContext.current
    var apiKey by remember { mutableStateOf(repository.currentApiKey().orEmpty()) }
    var model by remember { mutableStateOf(repository.currentModel()) }
    var allowlistText by remember { mutableStateOf(repository.currentAllowlist().joinToString("\n")) }
    var modelMenuExpanded by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        Text("Acesso a notificações", style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
        Text("Necessário para ler as notificações da sua carteira digital e apps bancários.")
        Button(
            onClick = { context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) },
            modifier = Modifier.padding(top = 8.dp, bottom = 24.dp),
        ) {
            Text("Abrir ajustes de notificação")
        }

        Text("Chave de API da Anthropic", style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
        OutlinedTextField(
            value = apiKey,
            onValueChange = {
                apiKey = it
                repository.updateApiKey(it)
            },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 24.dp),
            label = { Text("sk-ant-...") },
        )

        Text("Modelo Claude", style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
        ExposedDropdownMenuBox(
            expanded = modelMenuExpanded,
            onExpandedChange = { modelMenuExpanded = it },
            modifier = Modifier.padding(top = 8.dp, bottom = 24.dp),
        ) {
            OutlinedTextField(
                value = model,
                onValueChange = {},
                readOnly = true,
                modifier = Modifier.menuAnchor().fillMaxWidth(),
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = modelMenuExpanded) },
            )
            DropdownMenu(expanded = modelMenuExpanded, onDismissRequest = { modelMenuExpanded = false }) {
                AVAILABLE_MODELS.forEach { option ->
                    DropdownMenuItem(
                        text = { Text(option) },
                        onClick = {
                            model = option
                            repository.updateModel(option)
                            modelMenuExpanded = false
                        },
                    )
                }
            }
        }

        Text("Apps monitorados (um pacote por linha)", style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
        OutlinedTextField(
            value = allowlistText,
            onValueChange = {
                allowlistText = it
                repository.updateAllowlist(it.lines().map(String::trim).filter(String::isNotBlank).toSet())
            },
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            minLines = 6,
        )
    }
}
