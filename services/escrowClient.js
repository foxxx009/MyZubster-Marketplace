const axios = require('axios');
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3001';

module.exports = {
  async createEscrow(buyerId, sellerId, amount) {
    const { data } = await axios.post(`${GATEWAY_URL}/api/escrow`, { buyerId, sellerId, amount });
    return data;
  },
  async getEscrowStatus(escrowId) {
    const { data } = await axios.get(`${GATEWAY_URL}/api/escrow/${escrowId}`);
    return data;
  },
  async completeEscrow(escrowId) {
    const { data } = await axios.post(`${GATEWAY_URL}/api/escrow/${escrowId}/complete`);
    return data;
  },
  async disputeEscrow(escrowId, reason) {
    const { data } = await axios.post(`${GATEWAY_URL}/api/escrow/${escrowId}/dispute`, { reason });
    return data;
  }
};
