
class LRUNode<T> {
    protected m_next: LRUNode<T>|null = null;
    protected m_prev: LRUNode<T>|null = null;
    protected m_v: T;
    constructor(value: T) {
        this.m_v = value;
    }

    set next(node: LRUNode<T>|null) {
        this.m_next = node;
    }

    get next(): LRUNode<T>|null {
        return this.m_next;
    }

    set prev(node: LRUNode<T>|null) {
        this.m_prev = node;
    }

    get prev(): LRUNode<T>|null {
        return this.m_prev;
    }

    get value(): T {
        return this.m_v;
    }
}

class DLink<T> {
    protected m_count: number;
    protected m_head: LRUNode<T>|null = null;
    protected m_tail: LRUNode<T>|null = null;

    constructor() {
        this.m_count = 0;
    }

    get length(): number {
        return this.m_count;
    }

    get head(): LRUNode<T>|null {
        return this.m_head;
    }

    get tail(): LRUNode<T>|null {
        return this.m_tail;
    }

    public remove(node: LRUNode<T>) {
        if (this.length === 0) {
            return;
        }

        let prev = node.prev;
        let next = node.next;

        if (prev) {
            prev.next = next;
        }
        if (this.m_head === node) {
            this.m_head = next;
        }

        if (next) {
            next.prev = prev;
        }
        if (this.m_tail === node) {
            this.m_tail = prev;
        }

        this.m_count--;
    }

    public addToHead(node: LRUNode<T>) {
        let head = this.m_head;
        node.next = this.m_head;
        if (this.m_head) {
            this.m_head.prev = node;
        }
        this.m_head = node;

        if (this.m_count === 0) {
            this.m_tail = node;
        }

        this.m_count++;
    }

    public removeTail() {
        if (this.length === 0) {
            return;
        }

        this.remove(this.m_tail as LRUNode<T>);
    }

    clear() {
        this.m_head = null;
        this.m_tail = null;
        this.m_count = 0;
    }
}

export class LRUCache<TKey, TValue> {
    protected m_maxCount: number;
    protected m_memValue: Map<TKey, [TValue, LRUNode<TKey>]>;
    protected m_link: DLink<TKey>;
    constructor(maxCount: number) {
        this.m_maxCount = maxCount;
        this.m_memValue = new Map<TKey, [TValue, LRUNode<TKey>]>();
        this.m_link = new DLink<TKey>();
    }

    public set(key: TKey, value: TValue) {
        if (this.m_memValue.has(key)) {
            let [_, node] = this.m_memValue.get(key) as [TValue, LRUNode<TKey>];
            this.m_link.remove(node);
            this.m_link.addToHead(node);
            this.m_memValue.set(key, [value, node]);
        } else {
            if (this.m_link.length >= this.m_maxCount) {
                this.m_link.removeTail();
            }
            let node: LRUNode<TKey> = new LRUNode<TKey>(key);
            this.m_link.addToHead(node);
            this.m_memValue.set(key, [value, node]);
        }
    }

    public get(key: TKey): TValue|null {
        if (!this.m_memValue.has(key)) {
            return null;
        }
        let [value, _] = this.m_memValue.get(key) as [TValue, LRUNode<TKey>];
        this.set(key, value);
        return value;
    }

    public remove(key: TKey) {
        if (!this.m_memValue.has(key)) {
            return;
        }

        let [_, node] = this.m_memValue.get(key) as [TValue, LRUNode<TKey>];
        this.m_link.remove(node);
        this.m_memValue.delete(key);
    }

    public clear() {
        this.m_memValue.clear();
        this.m_link.clear();
    }

    public print() {
        let begin = this.m_link.head;
        while (begin) {
            let key: TKey = begin.value;
            let [value, _] = this.m_memValue.get(key) as [TValue, LRUNode<TKey>];
            begin = begin.next;
        }
    }
}

// let lru: LRUCache<number,string> = new LRUCache<number,string>(5);
// lru.set(1,'a');
// lru.print();
// lru.remove(1);
// lru.print();
// lru.set(1,'a');
// lru.set(2,'b');
// lru.set(3,'c');
// lru.set(4,'d');
// lru.set(5,'e');
// lru.print();
// let s:string|null = lru.get(3);
// lru.print();
// lru.set(6,'f');
// lru.print();