# YGO Ruling DB

A REST API and PostgreSQL database containing 15,000+ Yu-Gi-Oh! rulings and card records sourced from YGOResources.

## Features

- Search cards using fuzzy matching and partial names
- Retrieve detailed card information and print history
- Retrieve card images in small sizes only
- Browse and query 15,000+ rulings
- Resolve card references inside ruling text
- RESTful API built with Node.js and Express
- PostgreSQL-backed data storage

## Tech Stack

- Node.js
- Express.js
- PostgreSQL
- Jest
  

## Dataset

Current database contents include:

- 15,000+ rulings
- 14,000+ Yu-Gi-Oh! Cards
- Thousands of card records
- Historical print information
- Official ruling metadata

## Getting Started

### Install Dependencies

```bash
cd Backend
npm install
```

### Configure Environment Variables

```env
DATABASE_URL=postgresql://...
```

### Start the API

```bash
npm run dev
```

## Technical Challenges

- Imported and normalized thousands of cards and rulings from external data sources
- Implemented fuzzy matching for card searches
- Built automatic card reference resolution within ruling text
- Designed a relational PostgreSQL schema for cards, rulings, prints, and metadata
- Retrieving correct images for cards using multiple APIs

## Future Improvements

- Advanced filtering and search
- User Friendly UI
- Q&A System for users to ask and answer questions
- Public deployment
- API documentation
- Performance optimization
