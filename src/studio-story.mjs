import { createStory } from './story.mjs';
import { parseScene, serializeScene } from './scene.mjs';
import { downloadBlob } from './export-image.mjs';

export function mountStudioStory(host, getScene) {
  let chapters = [], index = -1, sequence = 0;
  const details = document.createElement('details'); details.id = 'story-controls'; details.className = 'control-section';
  const summary = document.createElement('summary'); summary.textContent = 'Visual story';
  const body = document.createElement('div'); body.className = 'control-section-body'; details.append(summary, body); host.append(details);
  const note = document.createElement('p'); note.className = 'export-note'; note.textContent = 'Capture the current design as a chapter. Edit the design in other tabs, then capture the next view. Stories are optional and export separately from your README graphic.'; body.append(note);
  const field = (name, label, tag) => { const wrapper = document.createElement('label'); wrapper.textContent = label; const control = document.createElement(tag); control.id = `story-${name}`; wrapper.htmlFor = control.id; body.append(wrapper, control); return control; };
  const select = field('chapters', 'Active chapter', 'select');
  const title = field('title', 'Chapter title', 'input'); title.maxLength = 200;
  const narration = field('narration', 'Narration', 'textarea'); narration.maxLength = 10000; narration.rows = 4;
  const status = document.createElement('p'); status.id = 'story-status'; status.setAttribute('role', 'status');
  const preview = document.createElement('iframe'); preview.id = 'story-preview-frame'; preview.title = 'Story preview'; preview.setAttribute('sandbox', 'allow-scripts'); preview.hidden = true; preview.style.cssText = 'width:100%;height:420px;border:0';
  const buttons = new Map();
  const freshId = () => { let id; do { id = `chapter-${++sequence}`; } while (chapters.some(chapter => chapter.id === id)); return id; };
  const story = () => createStory({ chapters });
  const button = (name, label, action) => {
    const control = document.createElement('button'); control.type = 'button'; control.id = `story-${name}`; control.className = 'secondary'; control.textContent = label;
    control.addEventListener('click', async () => { try { await action(); } catch (error) { status.textContent = error.message; } }); body.append(control); buttons.set(name, control); return control;
  };
  function sync(message = '') {
    select.replaceChildren(); chapters.forEach((chapter, i) => { const option = document.createElement('option'); option.value = String(i); option.textContent = `${i + 1}. ${chapter.title}`; select.append(option); });
    select.value = String(index); select.disabled = index < 0; title.disabled = narration.disabled = index < 0;
    title.value = chapters[index]?.title || ''; narration.value = chapters[index]?.narration || '';
    for (const name of ['duplicate', 'remove', 'preview', 'export-html', 'export-json']) buttons.get(name).disabled = index < 0;
    buttons.get('up').disabled = index <= 0; buttons.get('down').disabled = index < 0 || index === chapters.length - 1; buttons.get('create').disabled = chapters.length >= 64;
    status.textContent = message || `${chapters.length} chapters. Download Story JSON to save your work.`;
  }
  button('create', 'Create chapter', () => {
    if (chapters.length >= 64) throw new Error('A story supports at most 64 chapters.');
    let scene = getScene(); if (!scene) throw new Error('Render a scene before creating a chapter.');
    scene = structuredClone(scene.kind === 'time-lapse' ? scene.latest : scene); delete scene.story;
    const selection = scene.presentation.options.selection;
    chapters.push({ id: freshId(), title: `Chapter ${chapters.length + 1}`, narration: '', scene, selection: [selection?.start, selection?.end].filter(Boolean) }); index = chapters.length - 1; sync('Chapter created.');
  });
  button('duplicate', 'Duplicate chapter', () => { if (chapters.length >= 64) throw new Error('A story supports at most 64 chapters.'); const copy = structuredClone(chapters[index]); copy.id = freshId(); copy.title = `${copy.title.slice(0, 190)} copy`; chapters.splice(index + 1, 0, copy); index++; sync('Chapter duplicated.'); });
  button('up', 'Move chapter up', () => { [chapters[index - 1], chapters[index]] = [chapters[index], chapters[index - 1]]; index--; sync('Chapter moved up.'); });
  button('down', 'Move chapter down', () => { [chapters[index + 1], chapters[index]] = [chapters[index], chapters[index + 1]]; index++; sync('Chapter moved down.'); });
  button('remove', 'Remove chapter', () => { chapters.splice(index, 1); index = Math.min(index, chapters.length - 1); sync('Chapter removed.'); });
  button('preview', 'Preview story', async () => { const { renderSceneHTML } = await import('./renderer-html.mjs'); preview.srcdoc = renderSceneHTML(story(), { initialChapter: index }); preview.hidden = false; status.textContent = `Previewing ${chapters[index].title}.`; });
  button('export-html', 'Download story HTML', async () => { const { renderSceneHTML } = await import('./renderer-html.mjs'); downloadBlob(new Blob([renderSceneHTML(story())], { type: 'text/html' }), 'constellation-story.html'); });
  button('export-json', 'Download story JSON', () => downloadBlob(new Blob([serializeScene(story())], { type: 'application/json' }), 'constellation-story.json'));
  const input = field('import', 'Import story JSON', 'input'); input.type = 'file'; input.accept = '.json,application/json';
  input.addEventListener('change', async () => {
    try {
      const file = input.files[0]; if (!file) return; if (file.size > 32 * 1024 * 1024) throw new Error('Story JSON exceeds 32 MiB.');
      const scene = parseScene(await file.text()); if (!scene.story) throw new Error('This JSON does not contain a story.');
      chapters = structuredClone(scene.story.chapters); index = 0; sync('Story imported.');
    } catch (error) { status.textContent = error.message; } finally { input.value = ''; }
  });
  select.addEventListener('change', () => { index = Number(select.value); sync(); });
  title.addEventListener('input', () => { if (index < 0) return; chapters[index].title = title.value || `Chapter ${index + 1}`; select.options[index].textContent = `${index + 1}. ${chapters[index].title}`; });
  narration.addEventListener('input', () => { if (index >= 0) chapters[index].narration = narration.value; });
  body.append(status, preview); sync();
  return { get chapters() { return structuredClone(chapters); }, get activeChapter() { return index; }, story };
}
