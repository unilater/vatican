(() => {
  async function request(path, options = {}) {
    const response = await fetch(path, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const errorBody = await response.json();
        message = errorBody.error || message;
      } catch (error) {
        // no-op
      }
      throw new Error(message);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  window.OrDataStore = {
    async initDefaults() {
      await request('/api/init-defaults', { method: 'POST' });
    },

    async listEditions() {
      return request('/api/editions');
    },

    async getEdition(id) {
      return request(`/api/editions/${encodeURIComponent(id)}`);
    },

    async saveEdition(edition) {
      return request(`/api/editions/${encodeURIComponent(edition.id)}`, {
        method: 'PUT',
        body: edition
      });
    },

    async listMappingsByEdition(editionId) {
      return request(`/api/editions/${encodeURIComponent(editionId)}/mappings`);
    },

    async saveMapping(mapping) {
      return request(`/api/mappings/${encodeURIComponent(mapping.id)}`, {
        method: 'PUT',
        body: mapping
      });
    },

    async deleteMapping(mappingId) {
      return request(`/api/mappings/${encodeURIComponent(mappingId)}`, {
        method: 'DELETE'
      });
    },

    async clearMappingsByEdition(editionId) {
      return request(`/api/editions/${encodeURIComponent(editionId)}/mappings`, {
        method: 'DELETE'
      });
    },

    async replaceMappingsByEdition(editionId, mappings) {
      return request(`/api/editions/${encodeURIComponent(editionId)}/mappings/replace`, {
        method: 'PUT',
        body: { mappings }
      });
    },

    async listRssItemsByEdition(editionId) {
      return request(`/api/editions/${encodeURIComponent(editionId)}/rss`);
    },

    async upsertRssItems(editionId, items) {
      return request(`/api/editions/${encodeURIComponent(editionId)}/rss`, {
        method: 'PUT',
        body: { items }
      });
    }
  };
})();
