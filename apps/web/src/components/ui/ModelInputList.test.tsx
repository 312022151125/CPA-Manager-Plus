import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { MODEL_THINKING_LEVELS_CLEAR_MARKER } from '@/types';
import { ModelInputList } from './ModelInputList';
import type { ModelEntry } from './modelInputListUtils';

const findInputByLabelSuffix = (renderer: ReactTestRenderer, suffix: string) =>
  renderer.root
    .findAllByType('input')
    .find((input) => String(input.props['aria-label'] ?? '').endsWith(suffix));

describe('ModelInputList', () => {
  it('updates and clears modalities without waiting for blur', () => {
    let entries: ModelEntry[] = [
      {
        name: 'image-model',
        alias: '',
        inputModalities: ['text', 'image'],
        outputModalities: ['image'],
      },
    ];
    let renderer!: ReactTestRenderer;

    const render = () => (
      <ModelInputList
        entries={entries}
        onChange={(next) => {
          entries = next;
          renderer.update(render());
        }}
        showModalities
        inputModalitiesPlaceholder="Input modalities"
        outputModalitiesPlaceholder="Output modalities"
      />
    );

    act(() => {
      renderer = create(render());
    });

    const input = renderer.root.findByProps({ 'aria-label': 'Input modalities' });
    act(() => {
      input.props.onChange({ target: { value: 'text, audio' } });
    });
    expect(entries[0]?.inputModalities).toEqual(['text', 'audio']);

    const updatedInput = renderer.root.findByProps({ 'aria-label': 'Input modalities' });
    act(() => {
      updatedInput.props.onChange({ target: { value: '' } });
    });
    expect(entries[0]?.inputModalities).toEqual([]);
    expect(renderer.root.findByProps({ 'aria-label': 'Input modalities' }).props.value).toBe('');
  });

  it('defaults to CPA behavior and creates an empty custom levels array on selection', () => {
    let entries: ModelEntry[] = [{ name: 'thinking-model', alias: '' }];
    let renderer!: ReactTestRenderer;

    const render = () => (
      <ModelInputList
        entries={entries}
        onChange={(next) => {
          entries = next;
          renderer.update(render());
        }}
        showThinkingLevels
        thinkingLabel="Thinking levels"
        thinkingTooltip="Thinking help"
        thinkingDefaultLabel="Use CPA default"
        thinkingCustomLabel="Custom"
        thinkingAllowedLevelsLabel="Allowed thinking levels"
        thinkingRequiredError="Select at least one thinking level"
      />
    );

    act(() => {
      renderer = create(render());
    });

    expect(findInputByLabelSuffix(renderer, 'Use CPA default')?.props.checked).toBe(true);
    expect(findInputByLabelSuffix(renderer, 'Custom')?.props.checked).toBe(false);

    act(() => {
      findInputByLabelSuffix(renderer, 'Custom')?.props.onChange();
    });

    expect(entries[0]?.thinking).toEqual({ levels: [] });
    expect(renderer.root.findByProps({ role: 'alert' }).children.join('')).toContain(
      'Select at least one thinking level'
    );
  });

  it('updates known levels while preserving unknown levels and thinking fields', () => {
    let entries: ModelEntry[] = [
      {
        name: 'future-model',
        alias: '',
        thinking: { levels: ['high', 'ultra'], 'future-option': { enabled: true } },
      },
    ];
    let renderer!: ReactTestRenderer;

    const render = () => (
      <ModelInputList
        entries={entries}
        onChange={(next) => {
          entries = next;
          renderer.update(render());
        }}
        showThinkingLevels
        thinkingDefaultLabel="Use CPA default"
        thinkingCustomLabel="Custom"
        thinkingAllowedLevelsLabel="Allowed thinking levels"
      />
    );

    act(() => {
      renderer = create(render());
    });

    expect(findInputByLabelSuffix(renderer, ' high')?.props.checked).toBe(true);
    expect(
      renderer.root.findAllByType('span').some((node) => node.children.join('') === 'ultra')
    ).toBe(true);

    act(() => {
      findInputByLabelSuffix(renderer, ' high')?.props.onChange({
        target: { checked: false },
      });
    });
    expect(entries[0]?.thinking).toEqual({
      levels: ['ultra'],
      'future-option': { enabled: true },
    });

    act(() => {
      findInputByLabelSuffix(renderer, ' max')?.props.onChange({
        target: { checked: true },
      });
    });
    expect(entries[0]?.thinking).toEqual({
      levels: ['max', 'ultra'],
      'future-option': { enabled: true },
    });
  });

  it('removes only levels when returning to CPA default and marks an empty thinking clear', () => {
    let entries: ModelEntry[] = [
      { name: 'future-model', alias: '', thinking: { levels: ['high'], future: true } },
    ];
    let renderer!: ReactTestRenderer;

    const render = () => (
      <ModelInputList
        entries={entries}
        onChange={(next) => {
          entries = next;
          renderer.update(render());
        }}
        showThinkingLevels
        thinkingDefaultLabel="Use CPA default"
        thinkingCustomLabel="Custom"
      />
    );

    act(() => {
      renderer = create(render());
    });
    act(() => {
      findInputByLabelSuffix(renderer, 'Use CPA default')?.props.onChange();
    });

    expect(entries[0]?.thinking).toEqual({ future: true });
    expect(entries[0]?.[MODEL_THINKING_LEVELS_CLEAR_MARKER]).toBe(true);

    entries = [{ name: 'configured-model', alias: '', thinking: { levels: ['high'] } }];
    act(() => {
      renderer.update(render());
    });
    act(() => {
      findInputByLabelSuffix(renderer, 'Use CPA default')?.props.onChange();
    });

    expect(entries[0]?.thinking).toBeUndefined();
    expect(entries[0]?.[MODEL_THINKING_LEVELS_CLEAR_MARKER]).toBe(true);
  });

  it('gives each model thinking control a distinct accessible name', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <ModelInputList
          entries={[
            { name: 'model-a', alias: '', thinking: { levels: ['high'] } },
            { name: 'model-b', alias: '', thinking: { levels: ['high'] } },
          ]}
          onChange={() => {}}
          showThinkingLevels
        />
      );
    });

    const groups = renderer.root.findAllByProps({ role: 'radiogroup' });
    expect(groups).toHaveLength(2);
    expect(groups[0]?.props['aria-label']).not.toBe(groups[1]?.props['aria-label']);

    const customRadios = renderer.root
      .findAllByType('input')
      .filter(
        (input) => input.props.type === 'radio' && input.props['aria-label'].endsWith('Custom')
      );
    expect(customRadios.map((input) => input.props['aria-label'])).toEqual([
      expect.stringContaining('model-a'),
      expect.stringContaining('model-b'),
    ]);

    const highCheckboxes = renderer.root
      .findAllByType('input')
      .filter(
        (input) => input.props.type === 'checkbox' && input.props['aria-label'].endsWith(' high')
      );
    expect(highCheckboxes.map((input) => input.props['aria-label'])).toEqual([
      expect.stringContaining('model-a'),
      expect.stringContaining('model-b'),
    ]);
  });

  it('uses a non-empty accessible fallback for a blank model row', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <ModelInputList
          entries={[{ name: '', alias: '' }]}
          onChange={() => {}}
          showThinkingLevels
        />
      );
    });

    const group = renderer.root.findByProps({ role: 'radiogroup' });
    expect(group.props['aria-label']).toContain('Model 1');
    expect(
      renderer.root
        .findAllByType('input')
        .filter((input) => input.props.type === 'radio')
        .every((input) => String(input.props['aria-label']).trim().length > 0)
    ).toBe(true);
  });
});
