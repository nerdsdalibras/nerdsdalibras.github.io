package com.nerdsdalibras.walletcategorizer.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nerdsdalibras.walletcategorizer.ai.ChatMessage
import com.nerdsdalibras.walletcategorizer.repository.FinanceRepository
import kotlinx.coroutines.launch

@Composable
fun ChatScreen(repository: FinanceRepository) {
    var messages by remember { mutableStateOf(listOf<ChatMessage>()) }
    var input by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    Scaffold(
        bottomBar = {
            Row(modifier = Modifier.fillMaxWidth().padding(8.dp)) {
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Pergunte sobre seus gastos...") },
                )
                IconButton(
                    enabled = input.isNotBlank() && !isLoading,
                    onClick = {
                        val question = input
                        input = ""
                        messages = messages + ChatMessage("user", question)
                        isLoading = true
                        scope.launch {
                            val answer = repository.askAssistant(messages.dropLast(1), question)
                            messages = messages + ChatMessage("assistant", answer)
                            isLoading = false
                        }
                    },
                ) {
                    Icon(Icons.Filled.Send, contentDescription = "Enviar")
                }
            }
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f).fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(messages) { message -> ChatBubble(message) }
            }
            if (isLoading) {
                Box(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
                    CircularProgressIndicator(modifier = Modifier.padding(8.dp))
                }
            }
        }
    }
}

@Composable
private fun ChatBubble(message: ChatMessage) {
    val alignment = if (message.role == "user") Arrangement.End else Arrangement.Start
    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = alignment) {
        Card(modifier = Modifier.padding(4.dp)) {
            Text(message.content, modifier = Modifier.padding(12.dp))
        }
    }
}
