import redis

REDIS_HOST = "quicksand-coil-frisky-65237.db.redis.io"
REDIS_PORT = 19514
REDIS_PASSWORD = "wtDDs7U58W5j6PaFnCqpRE9XezkvL8QX"

def clear_cache():
    try:
        r = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            password=REDIS_PASSWORD,
            decode_responses=True,
            socket_connect_timeout=10
        )
        r.ping()
        print("✅ Connected to Redis Cloud!")
        
        keys = r.keys('*')
        print(f"📊 Cache entries before: {len(keys)}")
        
        r.flushall()
        print("✅ Cache cleared!")
        
        keys_after = r.keys('*')
        print(f"📊 Cache entries after: {len(keys_after)}")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    clear_cache()