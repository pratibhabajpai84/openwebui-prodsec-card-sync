import { declareIndexPlugin, ReactRNPlugin } from '@remnote/plugin-sdk';

const DEFAULT_NOTE_ID = '824194e8-3e15-4bf5-a9f8-2d35cef9c477';

interface ExportedCard {
  id: string;
  source: string;
  question: string;
  answer: string;
}

async function syncCardsFromOpenWebUI(plugin: ReactRNPlugin) {
  const baseUrl = ((await plugin.settings.getSetting<string>('openwebui_url')) || '').replace(/\/+$/, '');
  const apiKey = ((await plugin.settings.getSetting<string>('openwebui_api_key')) || '').trim();
  const noteId = ((await plugin.settings.getSetting<string>('openwebui_note_id')) || DEFAULT_NOTE_ID).trim();
  const targetDocName = ((await plugin.settings.getSetting<string>('target_rem_name')) || 'Product Security Interview').trim();

  if (!baseUrl || !apiKey) {
    await plugin.app.toast('Please configure your Open WebUI URL and API Key in Plugin Settings.');
    return;
  }

  try {
    const response = await fetch(`${baseUrl}/api/v1/notes/${noteId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      await plugin.app.toast(`Open WebUI Sync Error: HTTP ${response.status}`);
      return;
    }

    const noteData = await response.json();
    const rawContent: string =
      noteData?.data?.content?.md || noteData?.content || JSON.stringify(noteData);

    const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      await plugin.app.toast('No JSON card array found in the Open WebUI Export Note.');
      return;
    }

    const cards: ExportedCard[] = JSON.parse(jsonMatch[0]);
    const syncedIds: string[] = (await plugin.storage.getSynced<string[]>('synced_card_ids')) || [];

    let parentRem = await plugin.rem.findByName([targetDocName], null);
    if (!parentRem) {
      parentRem = await plugin.rem.createRem();
      if (parentRem) {
        await parentRem.setText([targetDocName]);
        await parentRem.setIsDocument(true);
      }
    }

    let createdCount = 0;
    for (const card of cards) {
      if (!card.id || syncedIds.includes(card.id)) {
        continue;
      }

      // Create Rem and populate front (.setText) and back (.setBackText) to generate a flashcard
      const rem = await plugin.rem.createRem();
      if (rem) {
        if (parentRem) {
          await rem.setParent(parentRem._id);
        }
        await rem.setText([`[${card.source}] ${card.question}`]);
        await rem.setBackText([card.answer]);
        await rem.setEnableForwardPractice(true);

        syncedIds.push(card.id);
        createdCount++;
      }
    }

    await plugin.storage.setSynced('synced_card_ids', syncedIds);

    if (createdCount > 0) {
      await plugin.app.toast(`Synced ${createdCount} new Product Security card(s) from Open WebUI!`);
    } else {
      await plugin.app.toast('All Open WebUI Product Security cards are already up to date.');
    }
  } catch (err: any) {
    await plugin.app.toast(`Failed to sync from Open WebUI: ${err?.message || String(err)}`);
  }
}

async function onActivate(plugin: ReactRNPlugin) {
  await plugin.settings.registerStringSetting({
    id: 'openwebui_url',
    title: 'Open WebUI Base URL (e.g., https://your-openwebui-domain.com)',
    defaultValue: '',
  });

  await plugin.settings.registerStringSetting({
    id: 'openwebui_api_key',
    title: 'Open WebUI API Key (From Open WebUI -> Settings -> Account -> API Keys)',
    defaultValue: '',
  });

  await plugin.settings.registerStringSetting({
    id: 'openwebui_note_id',
    title: 'Open WebUI Export Queue Note ID',
    defaultValue: DEFAULT_NOTE_ID,
  });

  await plugin.settings.registerStringSetting({
    id: 'target_rem_name',
    title: 'Target RemNote Document Name',
    defaultValue: 'Product Security Interview',
  });

  await plugin.app.registerCommand({
    id: 'sync-openwebui-prodsec-cards',
    name: 'Sync Product Security Cards from Open WebUI',
    action: async () => {
      await syncCardsFromOpenWebUI(plugin);
    },
  });

  await syncCardsFromOpenWebUI(plugin);
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);