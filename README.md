# YGO Ruling DB

A REST API and PostgreSQL database containing 15,000+ Yu-Gi-Oh! rulings and 14,000+ card records sourced from YGOResources and related public card data APIs.

## Features

- Search cards using fuzzy matching and partial names
- Retrieve detailed card information, print history, and metadata
- Retrieve optimized small-size card images
- Browse and query 15,000+ official rulings
- Resolve card references within ruling text
- RESTful API built with Node.js and Express
- PostgreSQL-backed relational data storage

## Tech Stack

- Node.js
- Express.js
- PostgreSQL
- Jest
- React.js

## Dataset

Current database contents include:

- 15,000+ rulings
- 14,000+ Yu-Gi-Oh! cards
- Historical print information
- Official ruling metadata
- Card images and reference data

## Getting Started

### Install Dependencies

```bash
cd Backend
npm install
```

### Configure Environment Variables

Create a `.env` file inside the `Backend` directory:

```env
DATABASE_URL=postgresql://...
```

### Start the API

```bash
npm run dev
```

## Technical Challenges

- Imported and normalized thousands of cards and rulings from external data sources
- Designed a relational PostgreSQL schema for cards, rulings, prints, and metadata
- Implemented fuzzy matching for flexible card search
- Built automatic card reference resolution within ruling text
- Integrated multiple APIs to retrieve accurate card data and images

## Future Improvements

- Advanced filtering and search
- User-friendly web interface
- Q&A system for users to ask and answer ruling questions
- Public deployment
- API documentation
- Performance optimization

