# 🚀 VibeCR – Inteligentny Asystent Code Review (100% Privacy-First)

> **Pierwsza linia obrony Twojego kodu. 100% lokalny audyt bezpieczeństwa i standardów z gotowymi poprawkami od AI.**

[![License: CC BY-SA 4.0](https://img.shields.io/badge/License-CC_BY--SA_4.0-lightgrey.svg)](https://creativecommons.org/licenses/by-sa/4.0/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Zero Build](https://img.shields.io/badge/Architecture-Zero--Build-6b21a8)](#)
[![WCAG / a11y](https://img.shields.io/badge/WCAG-AAA_Ready-ffe600?labelColor=000000)](#gotowość-korporacyjna-i-standardy-compliance)
[![PL / EN](https://img.shields.io/badge/i18n-PL_%7C_EN-blue)](#gotowość-korporacyjna-i-standardy-compliance)

---

## 💡 Czym jest VibeCR?

**VibeCR** to lekkie narzędzie dla zespołów programistycznych, które automatyzuje proces weryfikacji jakości i bezpieczeństwa kodu (*Code Review*) bezpośrednio na komputerze dewelopera. Działa jako „pierwsza linia obrony” przed wysłaniem zmian do głównego repozytorium – wykrywa błędy krytyczne, luki bezpieczeństwa oraz naruszenia standardów architektonicznych w kilka sekund, zanim kod trafi na biurko starszego programisty (*Senior Developera*).

---

## 🎯 Jaki problem biznesowy rozwiązuje?

* **Wąskie gardło w zespołach IT:** Doświadczeni programiści poświęcają znaczną część swojego czasu na ręczne sprawdzanie powtarzalnych błędów, formatowania i braków w obsłudze wyjątków u innych członków zespołu.
* **Ryzyko wycieku własności intelektualnej (IP) oraz RODO:** Korporacje i software house'y często blokują chmurowe narzędzia AI ze względu na zakaz wysyłania kodu źródłowego na zewnętrzne serwery, które przechowują dane.
* **Koszty późnego wykrycia błędów:** Wyciek klucza API do repozytorium lub błąd blokujący serwer (*Event Loop*) wykryty dopiero na produkcji generuje wysokie koszty przestoju i naprawy.

---

## ✨ Kluczowe korzyści dla organizacji (Wartość Biznesowa)

### 🔒 Pełne bezpieczeństwo danych i elastyczność AI (*Bring Your Own Model*)
Aplikacja działa w architekturze **Zero-Persistence** – nie posiada zewnętrznej bazy danych i nie gromadzi kodu źródłowego. Może działać w **100% offline** (opierając się na wbudowanych regułach heurystycznych oraz lokalnych modelach AI, takich jak **Ollama**, **LM Studio** czy **OpenCode**) lub łączyć się z komercyjnymi modelami (**Google Gemini**, **Anthropic Claude**, **OpenAI**) za pomocą klucza firmowego.

### 📏 Egzekwowanie wewnętrznych standardów firmy
Liderzy techniczni (*Tech Leadzi*) mogą zdefiniować w aplikacji własne reguły zespołowe (np. konwencje nazewnictwa, wymogi architektury) oraz wyeksportować je do pliku konfiguracyjnego. Każdy programista w zespole może jednym kliknięciem zaimportować standardy firmy, dzięki czemu AI ocenia kod dokładnie według wewnętrznych wytycznych organizacji.

### 🌐 Uniwersalność technologiczna (*Multi-stack*)
Narzędzie jest niezależne od technologii – automatycznie rozpoznaje **ponad 30 języków i frameworków** (m.in. *JavaScript/TypeScript, React, Vue, Angular, Svelte, Next.js, Python, Java, C#/.NET, Go, PHP, Rust, Ruby, SQL*). Jedno narzędzie obsługuje zarówno zespoły frontendowe, jak i backendowe.

### 🛠️ Gotowe rozwiązania zamiast samych ostrzeżeń
W przeciwieństwie do klasycznych linterów, które jedynie wskazują błąd, VibeCR generuje **gotowy fragment poprawionego kodu**. Programista może skopiować poprawkę jednym kliknięciem lub wyeksportować cały raport do formatu Markdown i dołączyć go do dokumentacji zadania (np. w *Jira / GitHub / GitLab*).

---

## 🔄 Jak wygląda proces pracy z narzędziem (User Journey)?

1. **Wybór projektu:** Programista wybiera swój projekt z listy zapisanych skrótów i decyduje, czy chce sprawdzić tylko swoje bieżące zmiany (`git diff`), czy przeskanować cały projekt.
2. **Szybki audyt w 4 obszarach:** Po kliknięciu *„Uruchom analizę”*, system dzieli wykryte uwagi na cztery priorytety biznesowo-techniczne:
   * 🔴 **Krytyczne:** Wycieki haseł/kluczy API, podatności na ataki hakerskie (XSS, SQL/Code Injection).
   * 🟣 **Framework:** Błędy specyficzne dla danej technologii powodujące np. spadek wydajności interfejsu.
   * 🟢 **Język i Runtime:** Błędy mogące zawiesić serwer lub spowodować nieobsłużone awarie aplikacji.
   * 🔵 **Jakość i Standardy:** Zbyt rozbudowane pliki („monolity”), naruszenia zasad czystego kodu (SOLID/DRY) oraz odstępstwa od standardów zespołu.
3. **Weryfikacja i wdrożenie:** Deweloper odrzuca uwagi, które uzna za nieistotne, a dla pozostałych kopiuje gotowe poprawki bezpośrednio do swojego edytora kodu.

---

## 🏢 Gotowość korporacyjna i standardy (Compliance)

* **Dostępność cyfrowa (WCAG / a11y):** Interfejs został wyposażony w dedykowany panel dostępności (skalowanie czcionek, tryb wysokiego kontrastu AAA, regulacja odstępów, pełna obsługa z klawiatury), dzięki czemu spełnia wymogi instytucji publicznych oraz dużych korporacji.
* **Wielojęzyczność (PL / EN):** Pełne wsparcie dla zespołów polskich oraz międzynarodowych – zarówno interfejs, jak i generowane przez AI wyjaśnienia oraz komentarze w kodzie dostosowują się do wybranego języka.
* **Brak kosztów infrastruktury:** Narzędzie nie wymaga utrzymywania żadnych serwerów w chmurze – uruchamiane jest lokalnie na stacji roboczej pracownika w kilka sekund.

---

## ⚡ Szybki start (Uruchomienie lokalne)

Wymagania: **Node.js >= 18**

```bash
# 1. Zainstaluj zależności (tylko Express)
npm install
# lub: pnpm install

# 2. Uruchom serwer lokalny
npm start
# lub: node server.js
