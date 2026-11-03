# Docker Office na nova aba (extensão)

Mostra o Docker Office como plano de fundo de toda nova aba em navegadores Chromium (Chrome, Edge, Brave, Vivaldi…).

1. Abra `chrome://extensions` e ligue o **Modo do desenvolvedor**.
2. **Carregar sem compactação** → escolha esta pasta (`extras/newtab-extension`).
3. Em **Detalhes → Opções da extensão**, informe o endereço, por exemplo `http://192.168.0.10:8420/?wallpaper=1`.

Na primeira nova aba o Chrome pergunta se você quer manter a mudança: escolha **Manter**.

- `wallpaper=1` esconde a interface, gira a câmera devagar e limita a 20 FPS. Ajuste com `&fps=15`, `&orbit=0` e `&cam=top`.
- Se a aba ficar em branco, mude o modo para **Ir direto para o endereço**.
- A extensão só pede `storage`, para guardar o endereço. Ela não lê as suas abas nem o seu histórico.
