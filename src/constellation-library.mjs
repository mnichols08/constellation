export function mountConstellationLibrary({ store, load }) {
  const launch = document.createElement('button'); launch.type = 'button'; launch.id = 'open-constellation-library'; launch.className = 'secondary'; launch.textContent = 'Saved constellations';
  document.querySelector('#open-studio').after(launch);
  const dialog = document.createElement('dialog'); dialog.id = 'constellation-library'; dialog.setAttribute('aria-labelledby', 'constellation-library-title');
  const heading = document.createElement('h2'); heading.id = 'constellation-library-title'; heading.textContent = 'Your saved constellations';
  const note = document.createElement('p'); note.textContent = 'Saved in this browser, grouped by GitHub account. Download config JSON to keep a portable copy.';
  const list = document.createElement('div'), status = document.createElement('p'); status.setAttribute('role', 'status');
  const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close'; close.addEventListener('click', () => dialog.close());
  dialog.append(heading, note, list, status, close); document.body.append(dialog);
  const button = (parent, text, run) => { const element = document.createElement('button'); element.type = 'button'; element.textContent = text; element.addEventListener('click', run); parent.append(element); return element; };
  function draw() {
    list.replaceChildren(); status.textContent = '';
    const saved = store.library();
    if (!saved.length) { const empty = document.createElement('p'); empty.textContent = 'No saved constellations yet. Create a preview, give it a title, then choose Save constellation.'; list.append(empty); }
    for (const item of saved) {
      const row = document.createElement('div'); row.className = 'saved-constellation-row';
      const label = document.createElement('strong'); label.textContent = `${item.name} · @${item.account}`; row.append(label);
      button(row, 'Open', async () => {
        for (const button of dialog.querySelectorAll('button')) button.disabled = true;
        try { if (await load(item.config)) dialog.close(); else status.textContent = 'Could not load this constellation. Try again when GitHub data is available.'; }
        catch (error) { status.textContent = error.message; }
        finally { for (const button of dialog.querySelectorAll('button')) button.disabled = false; }
      });
      button(row, 'Delete', () => { if (store.delete(item.account, item.name)) draw(); else status.textContent = 'Browser storage is unavailable.'; });
      list.append(row);
    }
  }
  launch.addEventListener('click', () => { draw(); dialog.showModal(); });
  window.addEventListener('storage', () => { if (dialog.open) draw(); });
}
