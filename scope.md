# Project Scope  
ChemSus Order Management System

## 1. Purpose of the Project
The purpose of this project is to provide ChemSus with a reliable and secure
online order system that ensures genuine customer orders through OTP verification
and verified online payments.

This system is intended to replace manual order handling and reduce fake inquiries.

---

## 2. In-Scope Features

### 2.1 Customer Features
- Product ordering through website
- Secure checkout process
- Mobile number verification using OTP
- Online payment through Razorpay
- Order confirmation after successful payment

### 2.2 System Capabilities
- OTP generation and validation
- Payment order creation
- Payment verification
- Order status tracking (Pending / Verified / Paid)

### 2.3 Platform Support
- Desktop browsers
- Mobile browsers
- Responsive web design

---

## 3. Out of Scope (Current Phase)
The following features are **not included in the current scope**:

- User login or customer accounts
- Admin dashboard
- Refund management
- Subscription-based orders
- Multi-currency payments
- International SMS support
- Inventory management

---

## 4. Constraints
- OTP delivery depends on SMS provider reliability.
- Payment gateway uptime affects order completion.
- Initial deployment limited to India-based payments.
- Test mode used during development phase.

---

## 5. Assumptions
- Customers are familiar with OTP-based verification.
- Customers have access to online payment methods.
- ChemSus will manage payment gateway credentials.
- Website traffic is moderate in the initial phase.

---

## 6. Risks
- SMS delivery delays
- Payment failures due to network issues
- Incorrect customer data entry
- Dependency on third-party services

---

## 7. Success Criteria
The project will be considered successful if:
- Customers can complete orders without manual intervention.
- OTP verification prevents fake orders.
- Payments are securely processed and confirmed.
- Order data is reliably captured.

---

## 8. Future Scope
The system can be extended in future phases to include:
- Admin order management panel
- Customer order history
- Automated invoices
- WhatsApp and email notifications
- Analytics and reporting
