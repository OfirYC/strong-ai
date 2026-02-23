# services/ai/tools/base.py

from abc import ABC, abstractmethod
from typing import Dict, Any


class BaseTool(ABC):
    name: str
    description: str
    parameters: Dict[str, Any]

    @property
    def openai_schema(self) -> Dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }

    @abstractmethod
    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        pass
