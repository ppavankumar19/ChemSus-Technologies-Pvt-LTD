# Project Specification  
ChemSus Order Management System (Web)

## 1. Overview
This project is a web-based order and payment system for the ChemSus website.  
It allows customers to place product orders, verify their mobile number using OTP,
complete payment securely, and receive order confirmation.

The system is designed to prevent fake orders, ensure valid customer details,
and provide a smooth checkout experience.

---

## 2. User Roles
The system currently supports the following roles:

- **Customer**
  - Places orders
  - Verifies mobile number using OTP
  - Makes payment
  - Receives order confirmation

- **Admin (future extension)**
  - Views orders
  - Tracks payment status
  - Manages products

---

## 3. Functional Requirements

### 3.1 Order Placement
- Customer can select products and quantity.
- Customer must enter personal details:
  - Full Name
  - Mobile Number
  - Email
  - Address
- Order cannot proceed without valid mobile number.

### 3.2 OTP Verification
- OTP is generated on the server (backend).
- OTP is a 6-digit numeric code.
- OTP is sent to the entered mobile number via SMS.
- OTP validity is limited to 5 minutes.
- Customer must enter the correct OTP to proceed.
- Incorrect or expired OTP blocks further steps.

### 3.3 Payment Processing
- Payment page is accessible only after OTP verification.
- Razorpay payment gateway is used.
- Payment methods include:
  - UPI
  - Debit Card
  - Credit Card
  - Net Banking
- Payment amount is calculated server-side.
- Payment is verified on the backend.

### 3.4 Order Confirmation
- On successful payment:
  - Order status is marked as PAID.
  - Confirmation page is shown to the customer.
  - Order ID is generated.
- Failed or cancelled payments do not create confirmed orders.

---

## 4. Technical Stack

### Frontend
- HTML
- CSS
- JavaScript (Vanilla)

### Backend
- Python
- Flask framework

### Database (initial phase)
- In-memory or SQLite
- Upgradeable to MySQL/PostgreSQL

### External Services
- OTP SMS Service (Fast2SMS / MSG91)
- Razorpay Payment Gateway

---

## 5. Security Requirements
- OTP generation only on server side.
- OTP expiration handling.
- Payment verification using Razorpay signature.
- Sensitive keys stored securely (not in frontend).
- HTTPS required for production deployment.

---

## 6. Error Handling
- Invalid OTP → user notified with retry option.
- OTP expired → resend option enabled.
- Payment failure → clear error message shown.
- Server errors logged internally.

---

## 7. Performance Requirements
- OTP should be delivered within a few seconds.
- Payment confirmation should be near real-time.
- System should support multiple simultaneous users.

---

## 8. Assumptions
- Users have a valid mobile number.
- SMS delivery depends on third-party provider uptime.
- Initial deployment is for Indian customers.

---

## 9. Future Enhancements
- Admin dashboard
- Order history for customers
- Email and WhatsApp notifications
- Invoice generation
- Multi-product checkout
