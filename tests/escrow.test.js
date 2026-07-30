const request = require('supertest');
const app = require('../server');
const escrowClient = require('../services/escrowClient');

describe('Escrow Integration', () => {
  let buyerToken, sellerToken;
  let buyerId, sellerId;
  let skillId;

  beforeAll(async () => {
    // Register buyer
    const buyerRes = await request(app)
      .post('/api/users/register')
      .send({ email: 'escrow-buyer@test.com', password: 'Buyer1234', name: 'Escrow Buyer' });
    buyerToken = buyerRes.body.token;
    buyerId = buyerRes.body.user.id;

    // Register seller
    const sellerRes = await request(app)
      .post('/api/users/register')
      .send({ email: 'escrow-seller@test.com', password: 'Seller1234', name: 'Escrow Seller' });
    sellerToken = sellerRes.body.token;
    sellerId = sellerRes.body.user.id;

    // Create a skill
    const skillRes = await request(app)
      .post('/api/skills')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ title: 'Escrow Test Skill', description: 'Test', price: 0.5, category: 'Test' });
    skillId = skillRes.body.id;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('1. Create standard order (no escrow)', async () => {
    const createEscrowSpy = jest.spyOn(escrowClient, 'createEscrow');
    const res = await request(app)
      .post('/api/orders')
      .send({ skill_id: skillId, buyer_id: buyerId, amount: 0.5 });
    expect(res.statusCode).toBe(201);
    expect(res.body.paymentMethod).toBe('standard');
    expect(res.body.escrowId).toBeUndefined();
    expect(res.body.escrowStatus).toBeUndefined();
    expect(createEscrowSpy).not.toHaveBeenCalled();
  });

  test('2. Create escrow order succeeds', async () => {
    jest.spyOn(escrowClient, 'createEscrow').mockResolvedValue({ id: 'escrow-123', status: 'pending' });
    const res = await request(app)
      .post('/api/orders')
      .send({ skill_id: skillId, buyer_id: buyerId, amount: 0.5, paymentMethod: 'escrow' });
    expect(res.statusCode).toBe(201);
    expect(res.body.paymentMethod).toBe('escrow');
    expect(res.body.escrowId).toBe('escrow-123');
    expect(res.body.escrowStatus).toBe('pending');
    expect(escrowClient.createEscrow).toHaveBeenCalledWith(buyerId, expect.any(Number), 0.5);
  });

  test('3. Escrow order gets escrowId saved', async () => {
    jest.spyOn(escrowClient, 'createEscrow').mockResolvedValue({ id: 'escrow-456' });
    const res = await request(app)
      .post('/api/orders')
      .send({ skill_id: skillId, buyer_id: buyerId, amount: 1.0, paymentMethod: 'escrow' });
    expect(res.statusCode).toBe(201);
    expect(res.body.escrowId).toBe('escrow-456');
  });

  test('4. Create escrow order - Gateway failure rolls back', async () => {
    jest.spyOn(escrowClient, 'createEscrow').mockRejectedValue(new Error('Gateway unreachable'));
    const res = await request(app)
      .post('/api/orders')
      .send({ skill_id: skillId, buyer_id: buyerId, amount: 0.5, paymentMethod: 'escrow' });
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toContain('Escrow creation failed');
  });

  test('5. GET /api/orders/:id/payment-status shows escrow info', async () => {
    jest.spyOn(escrowClient, 'createEscrow').mockResolvedValue({ id: 'escrow-789' });
    const createRes = await request(app)
      .post('/api/orders')
      .send({ skill_id: skillId, buyer_id: buyerId, amount: 0.5, paymentMethod: 'escrow' });
    const orderId = createRes.body.id;

    const res = await request(app).get(`/api/orders/${orderId}/payment-status`);
    expect(res.statusCode).toBe(200);
    expect(res.body.paymentMethod).toBe('escrow');
    expect(res.body.escrowStatus).toBe('pending');
  });

  test('6. GET /api/orders/:id/escrow returns escrow details', async () => {
    jest.spyOn(escrowClient, 'createEscrow').mockResolvedValue({ id: 'escrow-101' });
    jest.spyOn(escrowClient, 'getEscrowStatus').mockResolvedValue({ id: 'escrow-101', status: 'pending' });

    const createRes = await request(app)
      .post('/api/orders')
      .send({ skill_id: skillId, buyer_id: buyerId, amount: 0.5, paymentMethod: 'escrow' });
    const orderId = createRes.body.id;

    const res = await request(app)
      .get(`/api/orders/${orderId}/escrow`)
      .set('Authorization', `Bearer ${buyerToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.escrowId).toBe('escrow-101');
    expect(res.body.gatewayStatus).toBeDefined();
  });

  test('7. GET /api/orders/:id/escrow requires auth', async () => {
    jest.spyOn(escrowClient, 'createEscrow').mockResolvedValue({ id: 'escrow-111' });
    const createRes = await request(app)
      .post('/api/orders')
      .send({ skill_id: skillId, buyer_id: buyerId, amount: 0.5, paymentMethod: 'escrow' });
    const orderId = createRes.body.id;

    const res = await request(app).get(`/api/orders/${orderId}/escrow`);
    expect(res.statusCode).toBe(401);
  });

  test('8. POST /api/orders/:id/escrow/complete completes escrow', async () => {
    jest.spyOn(escrowClient, 'createEscrow').mockResolvedValue({ id: 'escrow-222' });
    const createRes = await request(app)
      .post('/api/orders')
      .send({ skill_id: skillId, buyer_id: buyerId, amount: 0.5, paymentMethod: 'escrow' });
    const orderId = createRes.body.id;

    // Manually set escrow to funded for the test
    const { Order } = require('../server').models;
    await Order.update({ escrowStatus: 'funded' }, { where: { id: orderId } });

    jest.spyOn(escrowClient, 'completeEscrow').mockResolvedValue({ status: 'completed' });
    const res = await request(app)
      .post(`/api/orders/${orderId}/escrow/complete`)
      .set('Authorization', `Bearer ${buyerToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.order.status).toBe('completed');
    expect(res.body.order.escrowStatus).toBe('completed');
  });

  test('9. POST /api/orders/:id/escrow/dispute disputes escrow', async () => {
    jest.spyOn(escrowClient, 'createEscrow').mockResolvedValue({ id: 'escrow-333' });
    const createRes = await request(app)
      .post('/api/orders')
      .send({ skill_id: skillId, buyer_id: buyerId, amount: 0.5, paymentMethod: 'escrow' });
    const orderId = createRes.body.id;

    // Manually set escrow to funded
    const { Order } = require('../server').models;
    await Order.update({ escrowStatus: 'funded' }, { where: { id: orderId } });

    jest.spyOn(escrowClient, 'disputeEscrow').mockResolvedValue({ status: 'disputed' });
    const res = await request(app)
      .post(`/api/orders/${orderId}/escrow/dispute`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ reason: 'Service not delivered' });
    expect(res.statusCode).toBe(200);
    expect(res.body.order.status).toBe('disputed');
    expect(res.body.order.escrowStatus).toBe('disputed');
  });

  test('10. Complete without auth returns 401', async () => {
    jest.spyOn(escrowClient, 'createEscrow').mockResolvedValue({ id: 'escrow-444' });
    const createRes = await request(app)
      .post('/api/orders')
      .send({ skill_id: skillId, buyer_id: buyerId, amount: 0.5, paymentMethod: 'escrow' });
    const orderId = createRes.body.id;

    const res = await request(app).post(`/api/orders/${orderId}/escrow/complete`);
    expect(res.statusCode).toBe(401);
  });

  test('11. Complete escrow on non-funded order fails', async () => {
    jest.spyOn(escrowClient, 'createEscrow').mockResolvedValue({ id: 'escrow-555' });
    const createRes = await request(app)
      .post('/api/orders')
      .send({ skill_id: skillId, buyer_id: buyerId, amount: 0.5, paymentMethod: 'escrow' });
    const orderId = createRes.body.id;

    const res = await request(app)
      .post(`/api/orders/${orderId}/escrow/complete`)
      .set('Authorization', `Bearer ${buyerToken}`);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('not in funded state');
  });

  test('12. Escrow on non-existent order returns 404', async () => {
    const res = await request(app)
      .post('/api/orders/99999/escrow/complete')
      .set('Authorization', `Bearer ${buyerToken}`);
    expect(res.statusCode).toBe(404);
  });
});
