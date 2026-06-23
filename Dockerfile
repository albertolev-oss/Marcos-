FROM mcr.microsoft.com/playwright:v1.44.0-jammy
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY src ./src
COPY openapi ./openapi
COPY docs ./docs
RUN npm run build
ENV HEADLESS=true PORT=3000
EXPOSE 3000
CMD ["npm", "run", "api"]
