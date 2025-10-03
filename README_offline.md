
# TSG Tennis – Offline (Saisons, Vollversion v3 FULL)
- Saisons (Auswahl/Neu), CI mit Logo, PWA-Manifest + Service Worker
- Teams (Festspielen + Teamfarbe), Spieler (Vor-/Nachname, LK), Spiele (Datum/Ort/**Uhrzeit**)
- Zuordnungen: Mehrere Spieler pro Spieltermin, **Live-Liste** unter dem Match, Statuswechsel, Festschreiben
- Regeln: 1 Team/Tag, Teamfarbe nach 2× „Gespielt“ im festspiel-aktivierten Team
- CRUD inkl. Löschen mit Kaskade (Spieler/Team/Spiel)
- Kein Seitenreload; Export/Import (JSON)
## Start
1) ZIP entpacken
2) `npx serve`
3) Browser öffnen (z. B. http://localhost:5000)

---

## Bereitstellung (kostenlos)
- **Vercel**: Projekt importieren → Framework „Other“ → Deploy.  
- **Netlify**: Ordner deployen → „Drag & Drop“ oder Git → automatische HTTPS/HTTP2.  
- **GitHub Pages**: Branch `main` → Settings → Pages aktivieren.

## Hinweise
- PWA erfordert HTTPS (lokal via `http://localhost` OK).
- Beim Ändern von Assets/JS bitte `SW_VERSION` in `sw.js` erhöhen, damit Caches aktualisiert werden.
- Icons liegen in `assets/icons/*` und sind als maskable markiert.
