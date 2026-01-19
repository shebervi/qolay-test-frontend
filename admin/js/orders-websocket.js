/**
 * WebSocket client for real-time order notifications
 * 
 * Usage:
 * const ordersWS = new OrdersWebSocket('http://localhost:3000', {
 *   restaurantId: 'restaurant-uuid',
 *   onOrderCreated: (order) => { console.log('New order:', order); },
 *   onOrderStatusChanged: (data) => { console.log('Status changed:', data); },
 *   onOrderUpdated: (order) => { console.log('Order updated:', order); }
 * });
 * 
 * // Later, to disconnect:
 * ordersWS.disconnect();
 */

class OrdersWebSocket {
  constructor(serverUrl, options = {}) {
    this.serverUrl = serverUrl;
    this.restaurantId = options.restaurantId;
    this.onOrderCreated = options.onOrderCreated || (() => {});
    this.onOrderStatusChanged = options.onOrderStatusChanged || (() => {});
    this.onOrderUpdated = options.onOrderUpdated || (() => {});
    this.onItemReadinessStatusChanged = options.onItemReadinessStatusChanged || (() => {});
    this.onConnect = options.onConnect || (() => {});
    this.onDisconnect = options.onDisconnect || (() => {});
    this.onError = options.onError || ((error) => console.error('WebSocket error:', error));
    
    this.socket = null;
    this.isConnected = false;
    
    this.connect();
  }

  /**
   * Connect to WebSocket server
   */
  connect() {
    // Check if socket.io client is loaded
    if (typeof io === 'undefined') {
      console.error('Socket.io client library not loaded. Include: <script src="https://cdn.socket.io/4.8.3/socket.io.min.js"></script>');
      this.onError(new Error('Socket.io client not loaded'));
      return;
    }

    console.log(`Connecting to WebSocket server at ${this.serverUrl}/orders`);

    // Create socket connection
    this.socket = io(`${this.serverUrl}/orders`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });

    // Connection established
    this.socket.on('connect', () => {
      console.log('WebSocket connected:', this.socket.id);
      this.isConnected = true;
      
      // Не подписываемся автоматически - подписки управляются через updateWebSocketFilters()
      // в orders.js для единообразной логики и применения фильтров
      
      this.onConnect();
    });

    // Disconnection
    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      this.isConnected = false;
      this.onDisconnect(reason);
    });

    // Reconnection attempt
    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`Reconnection attempt ${attemptNumber}...`);
    });

    // Reconnection success
    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`Reconnected after ${attemptNumber} attempts`);
      
      // Re-subscribe to restaurant notifications with saved filters
      if (this.restaurantId) {
        // Фильтры будут обновлены через updateWebSocketFilters() если функция доступна
        this.subscribeToRestaurant(this.restaurantId);
      }
    });

    // Subscription confirmation
    this.socket.on('subscribed', (data) => {
      console.log('Subscribed to restaurant notifications:', data);
    });

    // Error handling
    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.onError(error);
    });

    // Order events
    this.socket.on('order.created', (data) => {
      console.log('Order created event received:', data);
      this.onOrderCreated(data);
    });

    this.socket.on('order.status_changed', (data) => {
      console.log('Order status changed event received:', data);
      this.onOrderStatusChanged(data);
    });

    this.socket.on('order.updated', (data) => {
      console.log('Order updated event received:', data);
      this.onOrderUpdated(data);
    });

    this.socket.on('order.item_readiness_status_changed', (data) => {
      console.log('Order item readiness status changed event received:', data);
      this.onItemReadinessStatusChanged(data);
    });
  }

  /**
   * Subscribe to notifications for a specific restaurant
   * @param {string} restaurantId - Restaurant UUID
   * @param {object} filters - Optional filters for server-side filtering
   * @param {string[]} filters.statuses - Filter by order statuses
   * @param {number[]} filters.tableNumbers - Filter by table numbers
   * @param {number} filters.minAmount - Minimum order amount
   * @param {number} filters.maxAmount - Maximum order amount
   */
  subscribeToRestaurant(restaurantId, filters = null) {
    if (!this.socket || !this.isConnected) {
      console.warn('Cannot subscribe: socket not connected');
      return;
    }

    console.log(`Subscribing to restaurant: ${restaurantId}`, filters ? `with filters: ${JSON.stringify(filters)}` : '');
    this.restaurantId = restaurantId;
    
    const payload = { restaurant_id: restaurantId };
    if (filters) {
      payload.filters = filters;
    }
    
    this.socket.emit('subscribe_restaurant', payload);
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    if (this.socket) {
      console.log('Disconnecting from WebSocket server');
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  /**
   * Check if connected
   */
  isSocketConnected() {
    return this.isConnected;
  }

  /**
   * Get socket instance
   */
  getSocket() {
    return this.socket;
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OrdersWebSocket;
}
