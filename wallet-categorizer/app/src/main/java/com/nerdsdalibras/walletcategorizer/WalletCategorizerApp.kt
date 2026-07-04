package com.nerdsdalibras.walletcategorizer

import android.app.Application
import com.nerdsdalibras.walletcategorizer.data.AppDatabase
import com.nerdsdalibras.walletcategorizer.repository.FinanceRepository
import com.nerdsdalibras.walletcategorizer.util.SecurePrefs

class WalletCategorizerApp : Application() {

    lateinit var repository: FinanceRepository
        private set

    override fun onCreate() {
        super.onCreate()
        val database = AppDatabase.getInstance(this)
        val prefs = SecurePrefs(this)
        repository = FinanceRepository(database.categoryDao(), database.transactionDao(), prefs)
    }
}
