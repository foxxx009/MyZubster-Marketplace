const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Order = sequelize.define('Order', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    buyerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    sellerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    skillId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Skills',
        key: 'id'
      }
    },
    amount: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    currency: {
      type: DataTypes.STRING,
      defaultValue: 'USD'
    },
    moneroAddress: {
      type: DataTypes.STRING,
      allowNull: true
    },
    moneroAmount: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    txHash: {
      type: DataTypes.STRING,
      allowNull: true
    },
    addressIndex: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('pending', 'paid', 'in_progress', 'completed', 'cancelled', 'disputed'),
      defaultValue: 'pending'
    },
    network: {
      type: DataTypes.STRING,
      defaultValue: 'testnet'
    },
    confirmations: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    amountReceived: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    paidAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    paymentMethod: {
      type: DataTypes.ENUM('standard', 'escrow'),
      defaultValue: 'standard'
    },
    escrowId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    escrowStatus: {
      type: DataTypes.ENUM('pending', 'funded', 'completed', 'disputed', 'refunded'),
      allowNull: true
    }
  }, {
    timestamps: true,
    tableName: 'Orders'
  });

  Order.associate = (models) => {
    Order.belongsTo(models.User, { as: 'buyer', foreignKey: 'buyerId' });
    Order.belongsTo(models.User, { as: 'seller', foreignKey: 'sellerId' });
    Order.belongsTo(models.Skill, { foreignKey: 'skillId' });
  };

  return Order;
};
