import { getView } from '../router.js';
import { qs } from '../utils.js';
import { db } from '../db.js';

export async function renderSettings() {
  const view = getView();
  view.innerHTML = `
    <a class="back-link" href="#/">&larr; Home</a>
    <div class="section-title">Data &amp; Backup</div>
    <div class="card">
      <h3>Export Data</h3>
      <p>Save all log entries, calculator history, and presets to a JSON file. Keep a copy somewhere safe — this is the only backup, since data lives only on this device.</p>
      <button id="export-btn" class="btn btn-primary btn-block" type="button">Export to File</button>
    </div>
    <div class="card">
      <h3>Import Data</h3>
      <p>Restore from a previously exported file. Choose whether to merge with existing data or replace it entirely.</p>
      <input id="import-file" type="file" accept="application/json" />
      <div class="field" style="margin-top:10px;">
        <label><input id="import-replace" type="checkbox" style="width:auto; min-height:auto; vertical-align:middle;" /> Replace existing data (instead of merging)</label>
      </div>
      <button id="import-btn" class="btn btn-block" type="button">Import from File</button>
      <p id="import-status"></p>
    </div>
  `;

  qs('#export-btn', view).addEventListener('click', async () => {
    const payload = await db.exportAll();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `lab-tools-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  qs('#import-btn', view).addEventListener('click', async () => {
    const fileInput = qs('#import-file', view);
    const status = qs('#import-status', view);
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      status.textContent = 'Choose a backup file first.';
      return;
    }
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const replace = qs('#import-replace', view).checked;
      await db.importAll(payload, { replace });
      status.textContent = 'Import complete.';
    } catch (err) {
      status.textContent = `Import failed: ${err.message}`;
    }
  });
}
