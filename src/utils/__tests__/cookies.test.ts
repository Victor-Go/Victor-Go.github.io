import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getSavedResumesList,
  saveResumeSlot,
  loadResumeSlot,
  deleteResumeSlot,
  type ResumeTemplate
} from '../cookies';
import { defaultStyles } from '../storage';

describe('cookies utility (resume slot storage)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('should return empty list when no resumes are saved', () => {
    const list = getSavedResumesList();
    expect(list).toEqual([]);
  });

  it('should save a new resume slot and list it in the master list', () => {
    const name = 'My Resume';
    const markdown = '# My Resume Content';
    const template: ResumeTemplate = 'modernist';

    const saveResult = saveResumeSlot(name, markdown, defaultStyles, template);
    expect(saveResult.success).toBe(true);

    const list = getSavedResumesList();
    expect(list.length).toBe(1);
    expect(list[0].name).toBe(name);
    expect(list[0].template).toBe(template);
    expect(list[0].id).toBeDefined();

    const loadedData = loadResumeSlot(list[0].id);
    expect(loadedData).not.toBeNull();
    expect(loadedData?.name).toBe(name);
    expect(loadedData?.markdown).toBe(markdown);
    expect(loadedData?.template).toBe(template);
    expect(loadedData?.styles).toEqual(defaultStyles);
  });

  it('should update an existing resume slot when existingId is provided', () => {
    const name = 'Initial Name';
    const markdown = 'Initial markdown';
    const template: ResumeTemplate = 'classic';

    const saveResult = saveResumeSlot(name, markdown, defaultStyles, template);
    expect(saveResult.success).toBe(true);
    const initialList = getSavedResumesList();
    const id = initialList[0].id;

    // Update the slot
    const updatedName = 'Updated Name';
    const updatedMarkdown = 'Updated markdown';
    const updateResult = saveResumeSlot(updatedName, updatedMarkdown, defaultStyles, 'creative', id);
    expect(updateResult.success).toBe(true);

    const updatedList = getSavedResumesList();
    expect(updatedList.length).toBe(1);
    expect(updatedList[0].id).toBe(id);
    expect(updatedList[0].name).toBe(updatedName);
    expect(updatedList[0].template).toBe('creative');

    const loaded = loadResumeSlot(id);
    expect(loaded?.name).toBe(updatedName);
    expect(loaded?.markdown).toBe(updatedMarkdown);
    expect(loaded?.template).toBe('creative');
  });

  it('should delete a resume slot and keep a tombstone in the master list', () => {
    saveResumeSlot('R1', 'MD1', defaultStyles, 'minimalist');
    saveResumeSlot('R2', 'MD2', defaultStyles, 'developer');

    const listBefore = getSavedResumesList();
    expect(listBefore.length).toBe(2);

    const idToDelete = listBefore[0].id;
    deleteResumeSlot(idToDelete);

    const listAfter = getSavedResumesList();
    expect(listAfter.length).toBe(2);
    const deletedItem = listAfter.find((item) => item.id === idToDelete);
    expect(deletedItem).toBeDefined();
    expect(deletedItem?.deleted).toBe(true);

    expect(loadResumeSlot(idToDelete)).toBeNull();
  });

  it('should handle JSON parse errors in getSavedResumesList gracefully', () => {
    localStorage.setItem('saved_resumes_master_list', 'invalid-json');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const list = getSavedResumesList();
    expect(list).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should handle JSON parse errors in loadResumeSlot gracefully', () => {
    localStorage.setItem('saved_resume_slot_123', 'invalid-json');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = loadResumeSlot('123');
    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should handle exceptions in saveResumeSlot gracefully', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded');
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = saveResumeSlot('R', 'MD', defaultStyles, 'academic');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Quota exceeded');
    expect(consoleSpy).toHaveBeenCalled();
  });
});
