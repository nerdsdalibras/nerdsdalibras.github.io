# 🤝 Sistema de Afiliados — Clube da Libras

Guia para criar uma página de afiliado nova e ver os leads dela no CRM.
Cada afiliado tem a **mesma página** do Clube da Libras, com o **link de checkout dele**
(pra ganhar comissão) e uma **etiqueta** que faz os leads caírem separados no painel.

---

## 📁 Como funciona (visão rápida)

```
Página do afiliado  →  Formulário capta o lead  →  Checkout com o afid dele
 /afiliados.cris        (marca "afiliado=cris")      (comissão vai pra Cris)
        │                        │
        └────────────► CRM · aba "Afiliados" ◄────────┘
                 Ranking + funil: captado → carrinho → comprou/não comprou
```

- **Página:** um arquivo `afiliados.<slug>.html` por afiliado (cópia do modelo).
- **Rota:** uma linha em `_redirects` deixa a URL limpa (`/afiliados.<slug>`).
- **Painel:** a aba **Afiliados** do `dashboard.html` monta tudo sozinha —
  não precisa mexer em código pra cada afiliado novo.

---

## ➕ Criar um afiliado novo (ex.: **Bia**)

Você vai precisar de 3 coisas dessa pessoa:

| Marcador   | O que é                                   | Exemplo      |
|------------|-------------------------------------------|--------------|
| `__SLUG__` | apelido em minúsculas, **sem espaço/acento** | `bia`        |
| `__NOME__` | nome que aparece no painel                | `Bia`        |
| `__AFID__` | código de afiliado da Kiwify da pessoa    | `Zf0BfYEd`   |

> 💡 O `afid` é o código que vem no link de afiliado da Kiwify.
> Ex.: `https://pay.kiwify.com.br/1sIyvVL?afid=Zf0BfYEd` → o afid é `Zf0BfYEd`.

### Passo 1 — Duplicar o modelo
Copie o arquivo **`afiliados.MODELO.html`** e renomeie para **`afiliados.bia.html`**.

### Passo 2 — Substituir os 3 marcadores
Abra o arquivo novo e use **Localizar e Substituir** (Ctrl+H):

- `__SLUG__` → `bia`
- `__NOME__` → `Bia`
- `__AFID__` → o código de afiliado da Bia

(São vários `__AFID__` na página — um em cada botão de compra. O "Substituir tudo" troca todos de uma vez.)

### Passo 3 — Criar a rota no `_redirects`
Abra o arquivo **`_redirects`** e, na seção `── AFILIADOS ──`, adicione uma linha:

```
/afiliados.bia        /afiliados.bia.html                                        200
```

### Passo 4 — Publicar
Suba os dois arquivos alterados (`afiliados.bia.html` e `_redirects`).
Pronto: a página fica no ar em **`nerdsdalibras.com/afiliados.bia`** e os leads da Bia
já começam a aparecer na aba **Afiliados** do CRM. 🎉

---

## 🧪 Conferir se deu certo

1. Abra `nerdsdalibras.com/afiliados.bia` e verifique se carrega igual ao Clube.
2. Clique em um botão de compra e confirme que a URL da Kiwify termina com `?afid=<afid da Bia>`.
3. Preencha o formulário com um dado de teste → abra o CRM (`/dashboard`) → aba **Afiliados**
   → a Bia deve aparecer no ranking, e o lead de teste dentro dela.

---

## ⚠️ Passo único de configuração (só uma vez, não por afiliado)

O rastreamento grava duas colunas novas na planilha (`afiliado` e `afiliadoNome`).
Para isso funcionar, o código do **Google Apps Script** precisa estar na versão atual:

1. Abra o editor do Apps Script da planilha de leads.
2. Cole o conteúdo do arquivo **`apps-script.gs`** deste projeto.
3. **Implantar → Gerenciar implantações → editar (lápis) → Nova versão → Implantar.**

As colunas são criadas sozinhas na primeira captura — não precisa mexer na planilha à mão.
Depois de feito uma vez, todos os afiliados novos funcionam sem repetir esse passo.

---

## ❓ Perguntas rápidas

- **Um lead que já existia aparece no afiliado?** O lead fica vinculado ao **primeiro**
  afiliado que o trouxe; o sistema não sobrescreve com vazio depois.
- **Posso ter quantos afiliados quiser?** Sim. Cada um é só um arquivo + uma linha no `_redirects`.
- **E se eu não tiver o afid da pessoa ainda?** Dá pra publicar mesmo assim (o checkout
  cai no link padrão), mas aí a venda **não** é creditada. Coloque o `afid` assim que tiver.
