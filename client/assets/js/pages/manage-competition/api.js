import { getJson, deleteJson } from '../../core/http.js';

export const listCompetitions = (linkedCommunityId = '') => {
  const params = new URLSearchParams({
    limit: '500',
    sort: 'builderName,communityName',
    includeLinkedSummary: '1'
  });
  if (linkedCommunityId) params.set('linkedCommunityId', linkedCommunityId);

  return getJson(`/api/competitions?${params.toString()}`)
    .then((res) => ({
      items: Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : []),
      linkedCommunityOptions: Array.isArray(res?.linkedCommunityOptions) ? res.linkedCommunityOptions : []
    }));
};

export const listMyCommunities = () =>
  getJson('/api/communities/select-options?scope=company')
    .then((res) => (Array.isArray(res) ? res : []))
    .then((items) =>
      items
        .map((community) => ({
          id: String(community?.id || community?._id || '').trim(),
          name: String(
            community?.label ||
            community?.name ||
            community?.communityName ||
            ''
          ).trim()
        }))
        .filter((community) => community.id && community.name)
        .sort((a, b) => a.name.localeCompare(b.name))
    );

export async function deleteCompetition(id) {
  try {
    await deleteJson(`/api/competitions/${id}`);
    return true;
  } catch (err) {
    const msg = err?.data?.error || err?.message || 'Delete failed';
    throw new Error(msg);
  }
}
