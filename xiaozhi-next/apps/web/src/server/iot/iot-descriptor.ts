export interface IotPropertyDescriptor {
  name: string;
  description: string;
  type: string;
  value: any;
}

export interface IotMethodParameter {
  description: string;
  type: string;
}

export interface IotMethodDescriptor {
  name: string;
  description: string;
  parameters?: Record<string, IotMethodParameter>;
}

export class IotDescriptor {
  readonly name: string;
  readonly description: string;
  properties: IotPropertyDescriptor[] = [];
  methods: IotMethodDescriptor[] = [];

  constructor(
    name: string,
    description: string,
    properties: Record<string, any> | null,
    methods: Record<string, any> | null,
  ) {
    this.name = name;
    this.description = description;

    if (properties) {
      for (const [key, value] of Object.entries(properties)) {
        this.properties.push({
          name: key,
          description: value.description || '',
          type: value.type || 'string',
          value: value.type === 'number' ? 0 : value.type === 'boolean' ? false : '',
        });
      }
    }

    if (methods) {
      for (const [key, value] of Object.entries(methods)) {
        const method: IotMethodDescriptor = {
          name: key,
          description: value.description || '',
        };
        if (value.parameters) {
          method.parameters = {};
          for (const [pk, pv] of Object.entries(value.parameters)) {
            method.parameters[pk] = {
              description: (pv as any).description || '',
              type: (pv as any).type || 'string',
            };
          }
        }
        this.methods.push(method);
      }
    }
  }
}
