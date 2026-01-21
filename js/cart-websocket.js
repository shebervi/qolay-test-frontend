/**
 * WebSocket client for real-time cart updates
 *
 * Usage:
 * const cartWS = new CartWebSocket('http://localhost:3000', {
 *   sessionId: 'cart-session-uuid',
 *   onCartUpdated: ({ sessionId, cart }) => {},
 *   onCartCleared: ({ sessionId }) => {},
 * });
 */

class CartWebSocket {
  constructor(serverUrl, options = {}) {
    this.serverUrl = serverUrl;
    this.sessionId = options.sessionId || null;
    this.onCartUpdated = options.onCartUpdated || (() => {});
    this.onCartCleared = options.onCartCleared || (() => {});
    this.onConnect = options.onConnect || (() => {});
    this.onDisconnect = options.onDisconnect || (() => {});
    this.onError =
      options.onError || ((error) => console.error('WebSocket error:', error));

    this.socket = null;
    this.isConnected = false;

    this.connect();
  }

  connect() {
    if (typeof io === 'undefined') {
      console.error(
        'Socket.io client library not loaded. Include: <script src="https://cdn.socket.io/4.8.3/socket.io.min.js"></script>',
      );
      this.onError(new Error('Socket.io client not loaded'));
      return;
    }

    console.log(`Connecting to WebSocket server at ${this.serverUrl}/cart`);

    this.socket = io(`${this.serverUrl}/cart`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });

    this.socket.on('connect', () => {
      console.log('Cart WebSocket connected:', this.socket.id);
      this.isConnected = true;

      if (this.sessionId) {
        this.subscribeToCart(this.sessionId);
      }

      this.onConnect();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Cart WebSocket disconnected:', reason);
      this.isConnected = false;
      this.onDisconnect(reason);
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`Cart WebSocket reconnected after ${attemptNumber} attempts`);
      if (this.sessionId) {
        this.subscribeToCart(this.sessionId);
      }
    });

    this.socket.on('subscribed', (data) => {
      console.log('Subscribed to cart notifications:', data);
    });

    this.socket.on('error', (error) => {
      console.error('Cart WebSocket error:', error);
      this.onError(error);
    });

    this.socket.on('cart.updated', (data) => {
      console.log('Cart updated event received:', data);
      this.onCartUpdated(data);
    });

    this.socket.on('cart.cleared', (data) => {
      console.log('Cart cleared event received:', data);
      this.onCartCleared(data);
    });
  }

  subscribeToCart(sessionId) {
    if (!this.socket || !this.isConnected) {
      console.warn('Cannot subscribe: socket not connected');
      return;
    }

    this.sessionId = sessionId;
    this.socket.emit('subscribe_cart', { sessionId });
  }

  unsubscribeFromCart(sessionId) {
    if (!this.socket || !this.isConnected) {
      console.warn('Cannot unsubscribe: socket not connected');
      return;
    }

    this.socket.emit('unsubscribe_cart', { sessionId });
  }

  disconnect() {
    if (this.socket) {
      console.log('Disconnecting from cart WebSocket');
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  isSocketConnected() {
    return this.isConnected;
  }

  getSocket() {
    return this.socket;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CartWebSocket;
}
