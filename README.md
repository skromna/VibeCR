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
```

## 🤝 Dołącz do rozwoju VibeCR – Twórzmy to narzędzie razem!

VibeCR powstało z myślą o realnych potrzebach zespołów programistycznych i stanowi fundament, który można łatwo skalować oraz dostosowywać do wymogów konkretnej organizacji. Projekt rozwijany jest na otwartej licencji **CC BY-SA 4.0** w filozofii *zero-build* i *minimal-dependencies* (czysty Node.js + Express oraz Vanilla JS ES Modules). Dzięki temu próg wejścia w kod źródłowy jest minimalny – uruchomienie środowiska zajmuje kilkanaście sekund, a dodanie nowej funkcji nie wymaga przekopywania się przez warstwy abstrakcji.

Dalszy kierunek rozwoju aplikacji zależy bezpośrednio od Waszego feedbacku, dlatego zapraszamy programistów, liderów technicznych oraz partnerów biznesowych do wspólnego kształtowania kolejnego etapu VibeCR.

### Jak możesz się zaangażować?
- **Zostań Early Adopterem:** Uruchom VibeCR na swoim projekcie i daj nam znać, jak radzi sobie z Waszym stosem technologicznym w codziennej pracy.
- **Zbuduj bazę standardów:** Pomóż stworzyć i przetestować predefiniowane paczki reguł (`JSON`) dla konkretnych technologii i konwencji używanych w Waszych zespołach.
- **Rozwijaj reguły detekcji:** Masz pomysł na nową regułę heurystyczną, która wyłapie częsty błąd zanim kod trafi na Pull Request? Dopisz ją bezpośrednio w kodzie lub zgłoś propozycję!

### Kogo szukamy do współpracy?
- **Inżynierów różnych technologii (Python, Java, C#, Go, Rust, PHP):** Pomóżcie nam rozbudować lokalny silnik heurystyczny o reguły i antypatterny specyficzne dla Waszych ekosystemów.
- **Specjalistów Security (AppSec) i DevOps:** Wspólnie możemy rozszerzyć bazę wykrywanych podatności oraz stworzyć integracje z git-hookami (`pre-commit` / `pre-push`) i procesami CI/CD.
- **Ekspertów Prompt Engineeringu i lokalnych LLM:** Testujcie i optymalizujcie szablony promptów pod kątem mniejszych, lokalnych modeli (*Ollama, LM Studio, OpenCode*).

### Obszary współpracy biznesowej i organizacyjnej:
- **Wdrożenia pilotażowe (Proof of Concept):** Przetestowanie narzędzia w wybranym zespole projektowym i zmierzenie realnej oszczędności czasu podczas właściwego Code Review.
- **Kierunkowy rozwój funkcji (Feature Sponsorship):** Możliwość priorytetyzacji funkcji kluczowych dla Państwa organizacji (np. integracja z wewnętrznymi systemami CI/CD, dedykowane raporty PDF/HTML dla audytorów czy prekonfigurowane profile bezpieczeństwa).
- **Wsparcie inicjatywy:** Projekt rozwijany jest przy wsparciu **[Fundacji Nurt Przemian](https://nurtprzemian.pl/dokumenty/cegielka)** – zapraszamy do partnerstwa i współtworzenia standardów bezpiecznego oraz dostępnego cyfrowo oprogramowania.

---

## 🗺️ Kierunki rozwoju (Roadmapa) – co jeszcze możemy razem zrobić?

1. **Tryb CLI oraz Git Hooks (`pre-commit`):** Możliwość automatycznego blokowania commita w terminalu, jeśli VibeCR wykryje w kodzie błąd o statusie 🔴 *Krytycznym* (np. zaszyty klucz API lub hasło).
2. **Biblioteka gotowych profili (Presets):** Stworzenie katalogu gotowych standardów zespołowych do zaimportowania jednym kliknięciem (np. *„Standardy React + TypeScript Strict”*, *„Audyt bezpieczeństwa OWASP Top 10”*, *„Standardy Clean Architecture .NET”*).
3. **Rozbudowa lokalnej heurystyki multi-stack:** Rozszerzenie statycznej analizy (działającej w 100% offline, bez udziału AI) o zaawansowane reguły dla Pythona, Javy, C# czy Go.
4. **Wtyczki do IDE (VS Code / JetBrains):** Przeniesienie doświadczenia z przeglądarki bezpośrednio do paska bocznego edytora kodu dewelopera.

---

## 📄 Licencja i Autor

- **Licencja:** Projekt dostępny na licencji [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/).
- **Autor:** [Sandra Madalińska-Piórkowska](https://netbiznes.com/author.php?id=1) | [Fundacja Nurt Przemian](https://nurtprzemian.pl/dokumenty/cegielka) (`sandra@nurtprzemian.pl`)
