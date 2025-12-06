import { getJson } from '../../core/http.js';
import { renderSelectOptions, renderErrorOption } from '../../ui/select.js';

const defaultPlaceholder = { value: '', label: 'Select a community (optional)', selected: true };
const defaultErrorLabel = 'Communities unavailable';

export async function populateCommunitiesSelect(
  selectEl,
  {
    placeholder = defaultPlaceholder,
    errorLabel = defaultErrorLabel,
  } = {},
) {
  if (!selectEl) return { error: 'select-missing' };

  renderSelectOptions(selectEl, [], { placeholder });

  try {
    const communities = await getJson('/api/communities');
    const options = (communities || [])
      .map((community) => ({
        value: community._id,
        label: community.name || community.communityName || 'Unnamed community',
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    renderSelectOptions(selectEl, options, { placeholder });
    return { data: options };
  } catch (error) {
    console.error('Failed to load communities', error);
    renderErrorOption(selectEl, errorLabel);
    return { error };
  }
}
