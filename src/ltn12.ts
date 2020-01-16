/* ltn12 implementation, see http://lua-users.org/wiki/FiltersSourcesAndSinks */

export var Source: any = {};
export var Filter: any = {};
export var Sink: any   = {};
export var Pump: any   = {};

export var BLOCKSIZE: number = 2048;

/* 
 * Source is a function that generates data in every function call, 
 * and when there is not data, it generates null to indicate eof.
 * TYPE: [string, error?] Source();
 */

/*
 * Filter is a function that generates data by feeding data from Source or other filter,
 * Filter will holding a context that may change by input data.
 * Filter can concatenate with other Filters to produce chainning Filter. Type of return value of
 * Filter is same with Source. With input of empty string, context of Filter willn't change, and 
 * it will just return empty string and no error. With input of null, context also don't change,
 * just return null.
 * TYPE: [string, error?] Filter(string);
 */

/*
 * Sink is function that eats data.
 * TYPE: error? Sink(string, error?);
 */

/*
 * Pump function will pumps data from source to sink
 * TYPE: boolean Pump(src, sink);
 */

type SourceF = () => [string, any?];
type FilterF = (chunk: string) => [string, any?];
type SinkF   = (chunk: string, err?: any) => boolean;
type PumpF   = (src: SourceF, sink: SinkF) => boolean;


// SOURCE PART
Source.empty = (): SourceF => {
    return (): [string, any?] => {
        return [null, null];
    }
}

Source.string = (str: string): SourceF => {
    if(str == "" || str == null) return Source.empty();
    let i: number = 0;
    let len: number = str.length;
    return (): [string, any?] => {
        if(i == str.length) return null;
        let ret: string;
        if(len >= i + BLOCKSIZE)
            ret = str.substr(i, BLOCKSIZE);
        else
            ret = str.substr(i, len - 1);
        i += ret.length;
        return [ret, null];
    }
}

Source.chain = (src: SourceF, filter: FilterF): SourceF => {
    return (): [string, any?] => {
        let [r, e] = src();
        return filter(r);
    }
}


// FILTER PART
// low level filter, similar with pure function don't hold context
type LowlevelF = (ctx: any, chunk: string, extra: any) => [string, any];

Filter.cycle = (low: LowlevelF, ctx: any, extra: any): FilterF => {
    return (chunk: string): [string, any?] => {
        let [ret, ctx_] = low(ctx, chunk, extra);
        ctx = ctx_;
        return [ret, null];
    }
}

Filter.chainTwo = (f1: FilterF, f2: FilterF): FilterF => {
    return (chunk: string): [string, any?] => {
        let [r1, e1] = f1(chunk);
        if(r1 == null || e1 != null)
            return [r1, e1];
        return f2(r1);
    }
}

Filter.chain = (ff: FilterF[]): FilterF => {
    return (chunk: string): [string, any?] => {
        let false_state: boolean = false;
        if(false_state) {return [null, null];}
        let ret: [string, any?];
        for(let i in ff) {
            ret = ff[i](chunk);
            if(ret[1] != null || ret[0] == null) {
                false_state = true;
                return ret;
            }
            if(ret[0] == "") return ["", null];
            chunk = ret[0];
        }
        return ret;
    }
}



// SINK PART
Sink.nul = (): SinkF => {
    return (chunk: string, err?: any): boolean => {
        return true;
    }
}

Sink.chain = (filter: FilterF, sink: SinkF): SinkF => {
    return (chunk: string, err?: any): boolean => {
        let [r, e] = filter(chunk);
        if(r == null || e != null) return false;
        if(r == "") return true;
        return sink(r, err);
    }
}

Sink.table = (table: string[]): SinkF => {
    table = table || [];
    return (chunk: string): boolean => {
        if(chunk == null) return false;
        table.push(chunk);
        return true;
    }
}


// PUMP PART
Pump.step = (src: SourceF, sin: SinkF): boolean => {
    let [r, e] = src();
    return sin(r, e);
}

Pump.stepAll = (src: SourceF, sin: SinkF): boolean => {
    let [r, e] = src();
    for(;r != null && e == null; [r, e] = src()) {
        if(r == "") continue;
        if(!sin(r)) {
            return false;
        }
    }
    if(e == null) return true;
    return false;
}
