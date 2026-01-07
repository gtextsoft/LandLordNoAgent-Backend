# Commission Handling Documentation

## Overview

The commission system in LandLordNoAgent is centralized and configurable. All commission calculations use a single source of truth managed through `PlatformSettings` and accessed via `commissionService`.

## Default Commission Rate

**Default Rate: 10% (0.10)**

The default commission rate is set to 10% and is defined in:
- `LLNAB/models/PlatformSettings.js` - Database model default: `0.10`
- `LLNAF/src/components/admin/PlatformSettings.tsx` - Frontend default: `0.10`
- `LLNAF/src/components/admin/CommissionManagement.tsx` - Display default: `0.10`
- `LLNAF/src/components/landlord/EarningsDashboard.tsx` - Display default: `0.10`

## Where Commission is Applied

### Backend

1. **Payment Escrow Release** (`LLNAB/routes/payments.js`)
   - **Location**: `PUT /api/payments/:id/escrow/release` endpoint
   - **How**: Uses `commissionService.getCurrentCommissionRate()` to get current rate
   - **Calculation**: 
     - `commissionService.calculateCommission(grossAmount, commissionRate)`
     - `commissionService.calculateNetAmount(grossAmount, commissionRate, interest)`
   - **Stored**: Commission rate and amount are stored in the Payment document

2. **Payment Creation** (`LLNAB/routes/payments.js`)
   - **Location**: Payment creation endpoints
   - **Initial Value**: `commission_rate: 0` (set when escrow is released)
   - **Note**: Commission is not calculated at payment creation, only at escrow release

### Frontend

1. **Landlord Earnings Dashboard** (`LLNAF/src/components/landlord/EarningsDashboard.tsx`)
   - **Usage**: Displays current commission rate to landlords
   - **Source**: Loads from `GET /api/admin/commission/rate`
   - **Display**: Shows rate in percentage format (e.g., "10.0%")

2. **Admin Commission Management** (`LLNAF/src/components/admin/CommissionManagement.tsx`)
   - **Usage**: Displays commission statistics and current rate
   - **Source**: Loads from `GET /api/admin/commission/rate`
   - **Features**: 
     - View current rate
     - View commission history
     - View commission statistics

3. **Admin Platform Settings** (`LLNAF/src/components/admin/PlatformSettings.tsx`)
   - **Usage**: Allows admin to update commission rate
   - **API**: `PUT /api/admin/commission/rate` (requires reason)
   - **Validation**: Rate must be between 0 and 1 (0% to 100%)

4. **Admin Transaction Management** (`LLNAF/src/components/admin/TransactionManagement.tsx`)
   - **Usage**: Displays commission rate in transaction table header
   - **Source**: Loads from `GET /api/admin/commission/rate`
   - **Dynamic**: Shows current rate in confirm dialogs

5. **Admin Platform Analytics** (`LLNAF/src/components/admin/PlatformAnalytics.tsx`)
   - **Usage**: Displays commission rate in analytics overview
   - **Source**: Loads from `GET /api/admin/commission/rate`

## Commission Service API

### Backend Service (`LLNAB/services/commissionService.js`)

```javascript
// Get current commission rate
const rate = await commissionService.getCurrentCommissionRate();

// Calculate commission amount
const commissionAmount = commissionService.calculateCommission(grossAmount, rate);

// Calculate net amount (after commission and interest)
const netAmount = commissionService.calculateNetAmount(grossAmount, rate, interest);

// Update commission rate (admin only, requires reason)
await commissionService.updateCommissionRate(newRate, adminId, reason, ipAddress, userAgent);
```

### Frontend API (`LLNAF/src/lib/api.ts`)

```typescript
// Get current commission rate
const response = await commissionApi.getRate(token);

// Update commission rate
await commissionApi.updateRate(token, rate, reason);

// Get commission history
await commissionApi.getHistory(token, { startDate, endDate });

// Get commission statistics
await commissionApi.getStats(token, { startDate, endDate });

// Get commission report
await commissionApi.getReport(token, { startDate, endDate, format });
```

## Commission Flow

1. **Payment Creation**
   - Payment record created with `commission_rate: 0` and `commission_amount: 0`
   - Escrow status: `held`

2. **Escrow Release** (Admin action)
   - System fetches current commission rate from `PlatformSettings`
   - Calculates commission: `grossAmount × commissionRate`
   - Calculates net amount: `grossAmount - commissionAmount - interest`
   - Updates payment record with:
     - `commission_rate`: Current rate from settings
     - `commission_amount`: Calculated commission
     - `landlordNetAmount`: Net amount after deductions
   - Updates landlord account balances
   - Logs commission calculation to audit log

3. **Payout Request**
   - Landlord requests payout from available balance
   - Available balance already reflects net amount (after commission)

## Database Schema

### PlatformSettings Collection

```javascript
{
  commissionRate: Number,      // Default: 0.10 (10%)
  platformFee: Number,         // Default: 0
  lastUpdatedBy: ObjectId,     // Admin who last updated
  lastUpdatedAt: Date,
  effectiveFrom: Date,
  changeReason: String
}
```

### Payment Collection

```javascript
{
  amount: Number,              // Gross amount
  commission_rate: Number,     // Rate used (0 if not calculated yet)
  commission_amount: Number,   // Calculated commission (0 if not calculated)
  landlordNetAmount: Number,   // Net amount after commission and interest
  // ... other fields
}
```

### AuditLog Collection

Commission-related audit entries:
- `commission_rate_changed`: Logs when admin changes commission rate
- `payment_commission_calculated`: Logs commission calculation for each payment

## Configuration

### Changing Commission Rate

1. **Via Admin Dashboard**:
   - Navigate to Settings → Platform Settings
   - Update "Commission Rate (%)" field
   - Provide reason for change (required)
   - Save settings

2. **API Endpoint**:
   ```http
   PUT /api/admin/commission/rate
   Authorization: Bearer <admin_token>
   Content-Type: application/json
   
   {
     "rate": 0.15,
     "reason": "Updated commission rate to 15%"
   }
   ```

### Important Notes

- **Rate Format**: Stored as decimal (0.10 = 10%), displayed as percentage
- **Effective Date**: Changes apply to all future escrow releases
- **History**: All rate changes are logged in AuditLog
- **No Retroactive Changes**: Changes only affect new escrow releases, not existing payments

## Removed Hardcoded Values

The following hardcoded commission values have been removed and replaced with dynamic values:

1. ❌ `payments.js` line 238: Changed from `0.05` to `0` (set at escrow release)
2. ❌ `utils/stripe.js`: Removed default `0.05` parameter (now requires explicit rate)
3. ❌ `PlatformSettings.tsx`: Changed default from `0.05` to `0.10`
4. ❌ `TransactionManagement.tsx`: Removed hardcoded "5%" text
5. ❌ `PlatformAnalytics.tsx`: Removed hardcoded "5%" text
6. ❌ `faq.ts`: Updated to mention commission is configurable

## Testing

To verify commission is working correctly:

1. **Check Current Rate**:
   ```bash
   GET /api/admin/commission/rate
   ```

2. **Test Commission Calculation**:
   - Create a payment with escrow
   - Release escrow
   - Verify commission_amount matches: `grossAmount × commissionRate`

3. **Test Rate Change**:
   - Update commission rate via admin dashboard
   - Verify new rate is reflected in next escrow release
   - Check audit log for rate change entry

## Related Files

### Backend
- `LLNAB/models/PlatformSettings.js` - Commission rate storage
- `LLNAB/services/commissionService.js` - Commission calculation logic
- `LLNAB/routes/commission.js` - Commission API endpoints
- `LLNAB/routes/payments.js` - Escrow release with commission calculation
- `LLNAB/models/Payment.js` - Payment schema with commission fields
- `LLNAB/models/AuditLog.js` - Audit logging for commission changes

### Frontend
- `LLNAF/src/components/admin/CommissionManagement.tsx` - Commission statistics
- `LLNAF/src/components/admin/PlatformSettings.tsx` - Rate configuration UI
- `LLNAF/src/components/landlord/EarningsDashboard.tsx` - Landlord earnings view
- `LLNAF/src/components/admin/TransactionManagement.tsx` - Transaction management
- `LLNAF/src/components/admin/PlatformAnalytics.tsx` - Analytics display
- `LLNAF/src/lib/api.ts` - Commission API client functions

