import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', {
      exclude: ['/v1.0/debit/notify'],
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.seller.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.seller.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  const testUser = {
    email: 'e2e@test.com',
    password: 'password123',
    name: 'E2E Seller',
    phone: '081234567890',
  };

  it('POST /api/auth/register — creates user + seller', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(testUser)
      .expect(201);

    expect(res.body.email).toBe(testUser.email);
    expect(res.body.role).toBe('SELLER');
    expect(res.body.sellerStatus).toBe('PENDING');
  });

  it('POST /api/auth/register — rejects duplicate email', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(testUser)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(testUser)
      .expect(409);
  });

  it('POST /api/auth/login — returns tokens on valid credentials', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(testUser);

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: testUser.email, password: testUser.password })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.role).toBe('SELLER');
  });

  it('POST /api/auth/login — rejects wrong password', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(testUser);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: testUser.email, password: 'wrong' })
      .expect(401);
  });

  it('POST /api/auth/refresh — returns new access token', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(testUser);

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: loginRes.body.refreshToken })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
  });

  it('Protected route — rejects unauthenticated request (404 until seller controller exists)', async () => {
    // Seller controller doesn't exist yet (Fase 2), so route returns 404.
    // Change expectation to 401 once GET /api/seller/me is implemented.
    await request(app.getHttpServer())
      .get('/api/seller/me')
      .expect(404);
  });
});
