# Truvi Habitat Audit

## Overview

This audit confirms the current state of the Truvi platform and evaluates whether the proposed Habitat feature can be added cleanly to the existing architecture without disturbing the current real-estate marketplace domain.

The short answer is: yes, the platform is structurally ready for a modular extension, but Habitat is not yet implemented anywhere in the repo. It is a missing domain, not a small missing screen or route.

## Scope and goals

We reviewed the current repository to answer four questions:

1. What already exists in the application architecture and domain model?
2. Does the repo already contain Habitat functionality or supporting infrastructure?
3. What integration points are reusable for Habitat without violating the current domain boundaries?
4. What is the correct implementation path that preserves the real-estate product while introducing home-services workflows?

## Executive summary

The codebase is a React + Vite frontend and Express + TypeScript + Drizzle + PostgreSQL backend. It already contains a robust real-estate platform with user roles, onboarding, project inventory, leads, site visits, notifications, commissions, financing, and developer/admin tooling.

However, there is no Habitat-specific domain in the codebase:

- no Habitat routes mounted in the app shell
- no Habitat DB schema or migration model
- no provider/service catalog or booking lifecycle
- no buyer invitation or eligibility logic for home services
- no separate commission engine or settlement flow for Habitat
- no provider onboarding or fulfillment workflows

This means Habitat is not a one-line feature addition. It is a new domain extension that should be introduced in a modular, server-enforced way without merging it into the property-sales stacks.

## Architecture baseline

### Frontend

The client is a Vite React application using React Router and a shared app shell. The app is organized around feature pages and protected routes.

Evidence reviewed:
- `client/src/App.tsx`
- `client/src/lib/api.ts`
- `client/src/store/authStore.ts`

Observed patterns:
- route registration is centralized in `App.tsx`
- protected access is enforced with role-based guards
- authenticated state is persisted in a central Zustand store
- API calls flow through a shared client layer instead of ad hoc fetches

This is a good foundation for Habitat pages and flows because the app already supports a modular route structure and role enforcement.

### Backend

The server is an Express application with TS, Drizzle ORM, and PostgreSQL. It uses structured route modules and middleware for auth.

Evidence reviewed:
- `server/src/app.ts`
- `server/src/server.ts`
- `server/src/middleware/auth.ts`
- `server/src/config/env.ts`

Observed patterns:
- all routes are mounted from a central app bootstrap in `server/src/app.ts`
- auth middleware exposes `authenticate`, `optionalAuthenticate`, and `requireRole`
- environment config fails closed in production when required configuration is missing
- there is a clear separation between public, admin, and domain-scoped routes

This is a strong platform base for adding a Habitat domain without rewriting the platform.

### Database model

The database schema is the primary integration point. The current schema already models the existing real-estate platform domain.

Evidence reviewed:
- `server/src/db/schema.ts`

Observed patterns:
- users and roles are centrally modeled
- developer/project and commission concepts already exist
- listings/inventory, leads, site visits, notifications, payment/investment records, and related flows are established 
- there is no Habitat-specific domain structure such as providers, service categories, bookings, fulfillment records, or commissions tied to home services

This indicates the repo is built to be extended, but Habitat requires new schema additions rather than reuse of a hidden or partial implementation.

## Habitat gap analysis

### 1. No Habitat domain exists

There are no Habitat routes, pages, entities, or modules in the repository. Nothing suggests a partially implemented or hidden feature branch that can be activated.

### 2. Real-estate and Habitat are intentionally separate domains

The product context explicitly separates:
- property marketplace / sales lifecycle
- home-services / Habitat workflows

This is important because Habitat should not overload the real-estate domain tables or reuse property commission logic without a distinct diagram of ownership and constraints.

### 3. Existing roles are reusable but not Habitat-specific

The repo already supports roles such as:
- `ADMIN`
- `DEVELOPER`
- `CP`
- `BUYER`
- `AMBASSADOR`
- `VERIFIER`

These roles can be reused for Habitat flows, but Habitat will need additional role-aware capabilities such as provider onboarding, booking validation, and admin approval boundaries. The current role system is not enough by itself to define the Habitat business policy.

### 4. Product modeling is missing

The following Habitat concepts are not currently represented in the database or app logic:
- service providers
- provider onboarding and verification
- service categories or catalog items
- eligibility/invitation linkage for buyers
- booking lifecycle states
- fulfillment / completion / escalation flows
- review/rating model
- Habitat-specific settlement and commission computation

### 5. Security constraints must remain server-enforced

The app already enforces production safety, auth, and route access at the server layer. Habitat should continue to enforce all state changes on the backend, especially for:
- buyer invitation validation
- booking creation and cancellation
- provider approval and assignment
- status transitions
- financial calculations and commission release

Client-side logic can guide UX but must not be trusted for business rules.

## Integration fit assessment

### Good fit for extension

The repo is well suited for introducing Habitat because it already has:
- a centralized frontend route system
- auth + role gating
- DRY API layer patterns
- routed backend modules
- a domain-centric schema model structure

### Important guardrails

Habitat should be implemented as a distinct feature area, not by:
- mixing Habitat service records into real-estate listing tables
- reusing property-sale commission logic for home-services settlement
- allowing provider actions through client-only checks
- expanding existing domain roles without explicit new policy boundaries

## Recommended implementation model

### 1. Add Habitat as a modular backend domain

Create Habitat route modules under the backend, mounted as sibling modules to the existing domain modules in `server/src/app.ts`.

Recommended modules:
- `habitat` / `habitat-providers`
- `habitat-bookings`
- `habitat-commissions`
- `habitat-invitations`
- `habitat-services`
- `habitat-admin`

The objective is to keep Habitat separate from the current property domain but still rely on shared auth and user primitives.

### 2. Extend schema carefully

The database should support a home-services domain without diluting the property sales schema.

Recommended entities:
- `habitatProviders`
- `habitatProviderProfiles`
- `habitatServiceCategories`
- `habitatServicePackages`
- `habitatEligibilityInvitations`
- `habitatBookings`
- `habitatBookingStatusHistory`
- `habitatReviews`
- `habitatSettlements`
- `habitatCommissions`

These should use existing user/project patterns where applicable, but they must remain conceptually separate from property inventory and sales objects.

### 3. Reuse current auth without compromising boundaries

Habitat routes should use the same JWT-based auth pipeline and role middleware already present in `server/src/middleware/auth.ts`.

Recommended pattern:
- buyer and provider access is restricted by server-side role + ownership checks
- admin approval is enforced for onboarding and production actions
- provider identity is separated from user-only property flows

### 4. Add front-end feature pages in a dedicated module style

The frontend should add Habitat routes to `client/src/App.tsx` and create dedicated pages/components for:
- buyer landing
- provider onboarding
- service booking flow
- provider dashboard
- booking fulfillment
- admin approval and commission monitoring

This keeps Habitat distinct while keeping the global app shell and navigation consistent.

## Suggested implementation order

1. Audit and design freeze
2. Habitat schema and migrations
3. Auth + role enforcement for provider and buyer actions
4. Service catalog and invitation logic
5. Booking creation and status lifecycle
6. Provider fulfillment and buyer review flow
7. Settlement and commission engine
8. Admin monitoring and approval dashboard
9. Targeted validation and smoke tests

## Risks and constraints

### Product risk
The biggest risk is mixing Habitat into existing real-estate flows and creating operational ambiguity around commissions, user onboarding, and ownership rules.

### Technical risk
The main technical risk is introducing new booking/financial state without server-side validation. All status and financial transitions must be enforced by the backend.

### UX risk
The platform is mobile-first and already has a polished customer experience. Habitat pages should respect the same UX conventions and not degrade into a disconnected or ad hoc interface.

## Current status

The original audit recorded the repository before Habitat implementation began. An initial implementation foundation has since been added:
- Habitat data models and additive startup DDL, with Habitat disabled by default per project
- project invitation lookup and explicit buyer consent to claim
- provider applications, admin approval, service catalog, provider coverage, and manual assignment
- booking requests with server-enforced transitions, idempotency, status history, and buyer completion confirmation
- reviews for completed bookings
- buyer, provider, invitation, and admin pages integrated into the existing application

This is an operational MVP foundation, not a complete launch-ready marketplace. It currently does not collect payments or implement refunds, Habitat commissions, settlements, subscriptions, disputes resolution, or developer self-service/reporting. Those financial and operational flows must be designed and validated separately before representing Habitat as production-ready.

## Conclusion

The repo remains a solid base for Habitat as a deliberately separated domain. The initial implementation preserves existing real-estate flows and does not reuse their commissions or payment behavior. The next work should focus on agreeing the payment/commission model and then implementing financial ledger, refund, settlement, dispute, and developer authorization/reporting flows with database-backed integration tests.
