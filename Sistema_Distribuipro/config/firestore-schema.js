/**
 * =========================================================
 * DISTRIBUIDORA ERP - Modelagem Firestore
 * =========================================================
 * Estrutura completa de coleções e documentos
 * =========================================================
 */

const FIRESTORE_SCHEMA = {

    // ─── USUÁRIOS ──────────────────────────────────────────
    users: {
        _doc_id: "uid do Firebase Auth",
        name: "string",
        email: "string",
        phone: "string",
        role: "string (admin|gerente|caixa|vendedor|estoquista|financeiro|entregador|supervisor)",
        avatar: "string (URL)",
        status: "string (active|inactive|blocked)",
        commissionType: "string (none|percent|fixed)",
        commissionValue: "number",
        permissions: {
            dashboard: { view: true },
            products: { view: true, create: true, edit: true, delete: true },
            stock: { view: true, adjust: true },
            sales: { view: true, create: true, cancel: true, discount: true },
            customers: { view: true, create: true, edit: true },
            suppliers: { view: true, create: true, edit: true },
            purchases: { view: true, create: true },
            financial: { view: true, create: true, edit: true },
            cash: { view: true, open: true, close: true, supply: true, withdraw: true },
            deliveries: { view: true, manage: true },
            users: { view: true, create: true, edit: true },
            reports: { view: true, export: true },
            audit: { view: true },
            settings: { view: true, edit: true }
        },
        lastLogin: "timestamp",
        createdAt: "timestamp",
        updatedAt: "timestamp",
        createdBy: "string (uid)"
    },

    // ─── PRODUTOS ──────────────────────────────────────────
    products: {
        _doc_id: "auto-generated",
        name: "string",
        description: "string",
        internalCode: "string",
        barcode: "string",
        categoryId: "string",
        subcategoryId: "string",
        brandId: "string",
        unit: "string (UN|CX|FD|KG|LT|PC)",
        volume: "string",
        supplierId: "string",
        costPrice: "number",
        salePrice: "number",
        promoPrice: "number|null",
        profitMargin: "number",
        currentStock: "number",
        minStock: "number",
        stockLocation: "string",
        imageUrl: "string",
        status: "string (active|inactive)",
        sellUnit: "boolean",
        sellBox: "boolean",
        unitsPerBox: "number",
        variations: "array",
        notes: "string",
        expiryControl: "boolean",
        createdAt: "timestamp",
        updatedAt: "timestamp",
        createdBy: "string (uid)",
        updatedBy: "string (uid)",
        deleted: "boolean"
    },

    // ─── CATEGORIAS ────────────────────────────────────────
    categories: {
        _doc_id: "auto-generated",
        name: "string",
        description: "string",
        parentId: "string|null",
        order: "number",
        status: "string (active|inactive)",
        createdAt: "timestamp"
    },

    // ─── MARCAS ────────────────────────────────────────────
    brands: {
        _doc_id: "auto-generated",
        name: "string",
        logoUrl: "string",
        status: "string (active|inactive)",
        createdAt: "timestamp"
    },

    // ─── MOVIMENTAÇÕES DE ESTOQUE ──────────────────────────
    stock_movements: {
        _doc_id: "auto-generated",
        productId: "string",
        productName: "string",
        type: "string (entry|exit|adjustment|loss|transfer|return)",
        quantity: "number",
        previousStock: "number",
        newStock: "number",
        reason: "string",
        referenceType: "string (purchase|sale|adjustment|loss|inventory)",
        referenceId: "string",
        costPrice: "number",
        notes: "string",
        createdAt: "timestamp",
        createdBy: "string (uid)"
    },

    // ─── FORNECEDORES ──────────────────────────────────────
    suppliers: {
        _doc_id: "auto-generated",
        companyName: "string",
        tradeName: "string",
        document: "string (CPF/CNPJ)",
        phone: "string",
        whatsapp: "string",
        email: "string",
        address: { street: "", number: "", neighborhood: "", city: "", state: "", zip: "" },
        representative: "string",
        paymentTerms: "string",
        notes: "string",
        productsSupplied: "array",
        status: "string (active|inactive)",
        createdAt: "timestamp",
        updatedAt: "timestamp",
        createdBy: "string (uid)",
        deleted: "boolean"
    },

    // ─── CLIENTES ──────────────────────────────────────────
    customers: {
        _doc_id: "auto-generated",
        name: "string",
        document: "string (CPF/CNPJ)",
        phone: "string",
        whatsapp: "string",
        email: "string",
        address: { street: "", number: "", neighborhood: "", city: "", state: "", zip: "", complement: "", reference: "" },
        location: { lat: "number", lng: "number" },
        creditLimit: "number",
        currentDebt: "number",
        customerType: "string (pessoa_fisica|pessoa_juridica|revenda)",
        birthday: "string",
        notes: "string",
        totalPurchases: "number",
        purchaseCount: "number",
        averageTicket: "number",
        lastPurchase: "timestamp|null",
        status: "string (active|inactive|blocked)",
        vip: "boolean",
        createdAt: "timestamp",
        updatedAt: "timestamp",
        createdBy: "string (uid)",
        deleted: "boolean"
    },

    // ─── COMPRAS ───────────────────────────────────────────
    purchases: {
        _doc_id: "auto-generated",
        supplierId: "string",
        supplierName: "string",
        invoiceNumber: "string",
        date: "timestamp",
        subtotal: "number",
        extraCosts: "number",
        discount: "number",
        total: "number",
        paymentMethod: "string",
        paymentCondition: "string",
        notes: "string",
        status: "string (pending|received|cancelled)",
        items: [{ productId: "", productName: "", quantity: 0, unitCost: 0, totalCost: 0 }],
        generatePayable: "boolean",
        createdAt: "timestamp",
        createdBy: "string (uid)"
    },

    // ─── VENDAS ────────────────────────────────────────────
    sales: {
        _doc_id: "auto-generated",
        saleNumber: "number (sequencial)",
        customerId: "string|null",
        customerName: "string",
        sellerId: "string",
        sellerName: "string",
        commissionType: "string (none|percent|fixed)",
        commissionValue: "number",
        commissionAmount: "number",
        commissionStatus: "string (none|pending|paid)",
        items: [{ productId: "", productName: "", quantity: 0, unitPrice: 0, discount: 0, total: 0 }],
        subtotal: "number",
        discount: "number",
        surcharge: "number",
        deliveryFee: "number",
        total: "number",
        payments: [{ method: "string", amount: "number" }],
        change: "number",
        type: "string (balcao|entrega|retirada)",
        deliveryAddress: "object|null",
        notes: "string",
        status: "string (pending|completed|delivered|cancelled)",
        cashRegisterId: "string",
        createdAt: "timestamp",
        createdBy: "string (uid)",
        cancelledAt: "timestamp|null",
        cancelledBy: "string|null",
        cancelReason: "string|null"
    },

    // ─── ORDENS DE SERVIÇO ─────────────────────────────
    service_orders: {
        _doc_id: "auto-generated",
        orderNumber: "number (sequencial)",
        customerId: "string|null",
        customerName: "string",
        deviceType: "string",
        brand: "string",
        model: "string",
        imei: "string",
        serial: "string",
        problemReported: "string",
        diagnosis: "string",
        serviceDescription: "string",
        partsDescription: "string",
        technicianId: "string|null",
        technicianName: "string",
        laborValue: "number",
        partsValue: "number",
        discount: "number",
        total: "number",
        warrantyDays: "number",
        estimatedDate: "timestamp|null",
        status: "string (received|analyzing|awaiting_approval|approved|in_progress|awaiting_parts|ready|delivered|cancelled)",
        // 38.4 · OS da assistência (os-bancada-v1.js)
        deviceLock: "map {type: none|pin|password|pattern|not_informed, value, pattern:[0-8], clearedAt} — nunca vai para os_tracking",
        partsOrder: "map {supplierId, supplierName, part, cost, orderedAt, expectedAt, notes, receivedAt}",
        deposits: "array [{id, amount, method, at, by, cashRegisterId, movementId, refundedAt, retainedAt}]",
        depositTotal: "number (sinal já recebido; o faturamento cobra total - depositTotal)",
        notes: "string",
        createdAt: "timestamp",
        updatedAt: "timestamp",
        createdBy: "string (uid)",
        deleted: "boolean"
    },

    // ─── CAIXA ─────────────────────────────────────────────
    cash_registers: {
        _doc_id: "auto-generated",
        operatorId: "string",
        operatorName: "string",
        openedAt: "timestamp",
        closedAt: "timestamp|null",
        initialAmount: "number",
        totalCash: "number",
        totalPix: "number",
        totalCredit: "number",
        totalDebit: "number",
        totalFiado: "number",
        totalSales: "number",
        totalSupply: "number",
        totalWithdraw: "number",
        expectedAmount: "number",
        actualAmount: "number",
        difference: "number",
        status: "string (open|closed)",
        shift: "string (morning|afternoon|night)",
        notes: "string",
        createdBy: "string (uid)"
    },

    // ─── MOVIMENTAÇÕES DE CAIXA ────────────────────────────
    cash_movements: {
        _doc_id: "auto-generated",
        cashRegisterId: "string",
        type: "string (supply|withdraw|sale|refund)",
        amount: "number",
        paymentMethod: "string",
        description: "string",
        referenceId: "string",
        createdAt: "timestamp",
        createdBy: "string (uid)"
    },

    // ─── FINANCEIRO ────────────────────────────────────────
    financial_entries: {
        _doc_id: "auto-generated",
        type: "string (income|expense)",
        category: "string",
        subcategory: "string",
        description: "string",
        amount: "number",
        dueDate: "timestamp",
        paidDate: "timestamp|null",
        status: "string (pending|paid|overdue|cancelled)",
        paymentMethod: "string",
        recurrence: "string (none|weekly|monthly|yearly)",
        referenceType: "string (sale|purchase|manual)",
        referenceId: "string",
        attachmentUrl: "string",
        costCenter: "string",
        notes: "string",
        createdAt: "timestamp",
        createdBy: "string (uid)",
        updatedAt: "timestamp"
    },

    // ─── ENTREGAS ──────────────────────────────────────────
    deliveries: {
        _doc_id: "auto-generated",
        saleId: "string",
        saleNumber: "number",
        customerId: "string",
        customerName: "string",
        driverId: "string|null",
        driverName: "string",
        address: "object",
        deliveryFee: "number",
        status: "string (new|preparing|waiting|out|delivered|cancelled)",
        scheduledTime: "timestamp|null",
        estimatedTime: "number (minutos)",
        deliveredAt: "timestamp|null",
        changeFor: "number",
        paymentMethod: "string",
        notes: "string",
        location: { lat: "number", lng: "number" },
        createdAt: "timestamp",
        updatedAt: "timestamp"
    },

    // ─── ENTREGADORES ──────────────────────────────────────
    delivery_drivers: {
        _doc_id: "auto-generated",
        name: "string",
        phone: "string",
        vehicle: "string",
        plate: "string",
        commissionType: "string (fixed|percentage)",
        commissionValue: "number",
        status: "string (active|inactive|delivering)",
        totalDeliveries: "number",
        totalCommission: "number",
        createdAt: "timestamp"
    },

    // ─── AUDITORIA ─────────────────────────────────────────
    audit_logs: {
        _doc_id: "auto-generated",
        userId: "string",
        userName: "string",
        action: "string (login|logout|create|update|delete|cancel|adjust|close_cash|open_cash)",
        module: "string",
        entityId: "string",
        entityType: "string",
        details: "object",
        previousData: "object|null",
        newData: "object|null",
        ipAddress: "string",
        userAgent: "string",
        createdAt: "timestamp"
    },

    // ─── CONFIGURAÇÕES ─────────────────────────────────────
    settings: {
        _doc_id: "general",
        companyName: "string",
        tradeName: "string",
        document: "string",
        phone: "string",
        address: "object",
        logoUrl: "string",
        theme: "string (dark|light)",
        currency: "BRL",
        timezone: "America/Sao_Paulo",
        saleNumberSequence: "number",
        defaultDeliveryFee: "number",
        lowStockAlert: "boolean",
        financialAlerts: "boolean",
        printReceipt: "boolean",
        receiptHeader: "string",
        receiptFooter: "string"
    },

    // ─── NOTIFICAÇÕES ──────────────────────────────────────
    notifications: {
        _doc_id: "auto-generated",
        userId: "string (destinatário ou 'all')",
        title: "string",
        message: "string",
        type: "string (info|warning|error|success)",
        module: "string",
        referenceId: "string",
        read: "boolean",
        createdAt: "timestamp"
    }
};
