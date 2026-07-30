const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const escrowClient = require('../services/escrowClient');

// GET /api/orders - List all orders
router.get('/', async (req, res) => {
  try {
    const { Order, User, Skill } = req.models;
    const orders = await Order.findAll({
      include: [
        { model: User, as: 'buyer', attributes: ['id', 'email'] },
        { model: User, as: 'seller', attributes: ['id', 'email'] },
        { model: Skill, as: 'skill' }
      ]
    });
    res.json(orders);
  } catch (error) {
    console.error('❌ Error fetching orders:', error.message);
    res.status(500).json({ error: 'Error fetching orders' });
  }
});

// POST /api/orders - Create an order (supports escrow)
router.post('/', async (req, res) => {
  try {
    const { Order, Skill } = req.models;
    const { skill_id, buyer_id, amount, paymentMethod } = req.body;
    const skill = await Skill.findByPk(skill_id);
    if (!skill || skill.status !== 'active') {
      return res.status(400).json({ error: 'Skill not available' });
    }

    const orderData = {
      buyer_id,
      seller_id: skill.seller_id,
      skill_id,
      amount: amount || skill.price,
      status: 'pending',
      paymentMethod: paymentMethod || 'standard'
    };

    const newOrder = await Order.create(orderData);

    // If escrow payment, create escrow with Gateway
    if (paymentMethod === 'escrow') {
      try {
        const escrowResult = await escrowClient.createEscrow(buyer_id, skill.seller_id, orderData.amount);
        newOrder.escrowId = escrowResult.id || escrowResult.escrowId;
        newOrder.escrowStatus = 'pending';
        await newOrder.save();
      } catch (escrowError) {
        console.error('❌ Escrow creation failed:', escrowError.message);
        // Rollback order if escrow fails
        await newOrder.destroy();
        return res.status(502).json({ error: 'Escrow creation failed: ' + escrowError.message });
      }
    }

    res.status(201).json(newOrder);
  } catch (error) {
    console.error('❌ Error creating order:', error.message);
    res.status(500).json({ error: 'Error creating order' });
  }
});

// GET /api/orders/my-orders - Get current user's orders
router.get('/my-orders', auth, async (req, res) => {
  try {
    const { Order, Skill } = req.models;
    const userId = req.user.id;
    const orders = await Order.findAll({
      where: { buyer_id: userId },
      include: [{ model: Skill, as: 'skill' }]
    });
    res.json(orders);
  } catch (error) {
    console.error('❌ Error fetching user orders:', error.message);
    res.status(500).json({ error: 'Error fetching orders' });
  }
});

// GET /api/orders/:id - Get order by ID
router.get('/:id', async (req, res) => {
  try {
    const { Order, User, Skill } = req.models;
    const order = await Order.findByPk(req.params.id, {
      include: [
        { model: User, as: 'buyer', attributes: ['id', 'email'] },
        { model: User, as: 'seller', attributes: ['id', 'email'] },
        { model: Skill, as: 'skill' }
      ]
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (error) {
    console.error('❌ Error fetching order:', error.message);
    res.status(500).json({ error: 'Error fetching order' });
  }
});

// GET /api/orders/:id/payment-status - Check payment status
router.get('/:id/payment-status', async (req, res) => {
  try {
    const { Order } = req.models;
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ status: order.status, paymentMethod: order.paymentMethod, escrowStatus: order.escrowStatus });
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ error: 'Error checking payment status' });
  }
});

// === Escrow-specific endpoints ===

// GET /api/orders/:id/escrow - Get escrow status
router.get('/:id/escrow', auth, async (req, res) => {
  try {
    const { Order } = req.models;
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!order.escrowId) return res.status(400).json({ error: 'No escrow found for this order' });

    const escrowStatus = await escrowClient.getEscrowStatus(order.escrowId);
    res.json({ orderId: order.id, escrowId: order.escrowId, gatewayStatus: escrowStatus, localEscrowStatus: order.escrowStatus });
  } catch (error) {
    console.error('❌ Error fetching escrow status:', error.message);
    res.status(502).json({ error: 'Failed to fetch escrow status: ' + error.message });
  }
});

// POST /api/orders/:id/escrow/complete - Complete escrow payment
router.post('/:id/escrow/complete', auth, async (req, res) => {
  try {
    const { Order } = req.models;
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!order.escrowId) return res.status(400).json({ error: 'No escrow associated with this order' });
    if (order.escrowStatus !== 'funded') return res.status(400).json({ error: 'Escrow is not in funded state. Current status: ' + order.escrowStatus });

    const result = await escrowClient.completeEscrow(order.escrowId);
    order.status = 'completed';
    order.escrowStatus = 'completed';
    order.completedAt = new Date();
    await order.save();

    res.json({ message: 'Escrow completed', order });
  } catch (error) {
    console.error('❌ Error completing escrow:', error.message);
    res.status(502).json({ error: 'Failed to complete escrow: ' + error.message });
  }
});

// POST /api/orders/:id/escrow/dispute - Dispute escrow
router.post('/:id/escrow/dispute', auth, async (req, res) => {
  try {
    const { Order } = req.models;
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!order.escrowId) return res.status(400).json({ error: 'No escrow associated with this order' });
    if (order.escrowStatus !== 'funded') return res.status(400).json({ error: 'Escrow is not in funded state. Current status: ' + order.escrowStatus });

    const { reason } = req.body;
    const result = await escrowClient.disputeEscrow(order.escrowId, reason || 'Buyer initiated dispute');
    order.status = 'disputed';
    order.escrowStatus = 'disputed';
    await order.save();

    res.json({ message: 'Escrow disputed', order });
  } catch (error) {
    console.error('❌ Error disputing escrow:', error.message);
    res.status(502).json({ error: 'Failed to dispute escrow: ' + error.message });
  }
});

module.exports = router;
